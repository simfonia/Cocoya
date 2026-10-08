// P2-5（2026-10-03）自 mcu.rs 拆分。串流轉發：背壓 + 時間窗聚合（高頻 print 保護） 
//! 對外 API（#[tauri::command] 與 pub 函式）維持不變，由 mod.rs 以 pub use 重新導出。


use std::io::Read;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::{Emitter, Window};

/// 中文字（3 bytes）若被切在邊界會變 �。此函式偵測尾端殘缺序列，呼叫端將其
/// 留到下一批合併後再解碼（對齊 PC run_python 的行式 read_until 完整性）。
pub(crate) fn utf8_incomplete_tail_len(buf: &[u8]) -> usize {
    if buf.is_empty() {
        return 0;
    }
    let mut cont: usize = 0;
    for &b in buf.iter().rev().take(4) {
        if (b & 0xC0) == 0x80 {
            cont += 1;
        } else {
            let expected = if b < 0x80 {
                1
            } else if (b & 0xE0) == 0xC0 {
                2
            } else if (b & 0xF0) == 0xE0 {
                3
            } else if (b & 0xF8) == 0xF0 {
                4
            } else {
                1
            };
            if cont + 1 < expected {
                return cont + 1;
            } else {
                return 0;
            }
        }
    }
    cont
}

/// 具備背壓與時間窗聚合的串流轉發函式
/// 解決高頻 print (如 while True: print("hello")) 造成的 Tauri IPC 洪水與 WebView 卡死
pub(crate) fn forward_stream_with_backpressure<R: Read + Send + 'static>(
    reader: R,
    window: Window,
    label: String,
    event_name: &'static str,
    stopped: Option<Arc<AtomicBool>>,
    on_finished_event: Option<&'static str>,
) {
    forward_stream_with_controls(
        reader,
        window,
        label,
        event_name,
        stopped,
        on_finished_event,
        Vec::new(),
        None,
    );
}

pub(crate) struct StreamMarker {
    pub token: &'static str,
    pub on_detected: Arc<dyn Fn() + Send + Sync>,
}

/// Incremental marker filter: recognizes markers across arbitrary read boundaries,
/// invokes control callbacks before ordinary log chunks enter the lossy backpressure queue.
struct MarkerFilter {
    markers: Vec<StreamMarker>,
    seen: Vec<bool>,
    pending: Vec<u8>,
}

impl MarkerFilter {
    fn new(markers: Vec<StreamMarker>) -> Self {
        let seen = vec![false; markers.len()];
        Self { markers, seen, pending: Vec::new() }
    }

    /// token 的匹配變體：原 token 必備；尾端 `\n` 者另加 `\r\n` 變體
    /// （Python `print()` 在 Windows 文本模式輸出 `\r\n`，見 2026-10-08 Bug A）。
    /// 回傳 (pattern, marker_index)；同 marker 的兩變體共用同一個 seen 旗標。
    fn match_patterns(&self) -> Vec<(Vec<u8>, usize)> {
        let mut out = Vec::new();
        for (marker_index, marker) in self.markers.iter().enumerate() {
            let token = marker.token.as_bytes();
            out.push((token.to_vec(), marker_index));
            if token.ends_with(b"\n") && !token.ends_with(b"\r\n") {
                let mut crlf = token[..token.len() - 1].to_vec();
                crlf.extend_from_slice(b"\r\n");
                out.push((crlf, marker_index));
            }
        }
        out
    }

    fn push(&mut self, chunk: &[u8]) -> Vec<u8> {
        self.pending.extend_from_slice(chunk);
        let mut output = Vec::new();

        loop {
            let patterns = self.match_patterns();
            let found = patterns.iter().find_map(|(pattern, marker_index)| {
                self.pending.windows(pattern.len())
                    .position(|window| window == pattern.as_slice())
                    .map(|index| (index, pattern.len(), *marker_index))
            });

            if let Some((index, token_len, marker_index)) = found {
                output.extend_from_slice(&self.pending[..index]);
                self.pending.drain(..index + token_len);
                if !self.seen[marker_index] {
                    self.seen[marker_index] = true;
                    (self.markers[marker_index].on_detected)();
                }
                continue;
            }

            let patterns = self.match_patterns();
            // 保留**最長**的 pattern 前綴後綴（從 start=0 最長後綴往短找）。
            // 反向（.rev，最短優先）是 bug：單字 `_` 即是所有 `__...` pattern 的
            // 前綴，會只保留 1 byte、漏掉 marker 名字中間被切斷的前綴
            // （2026-10-08 實測：`__COCOYA_SERIAL_CONNECTED__` 分兩行漏出）。
            // 變體已含 `\r\n` 版，故 `...__\r` 這類前綴會被自然保留到下一 chunk。
            let keep_from = (0..self.pending.len()).find(|start| {
                let suffix = &self.pending[*start..];
                patterns.iter().any(|(pattern, _)| pattern.starts_with(suffix))
            });
            if let Some(start) = keep_from {
                output.extend_from_slice(&self.pending[..start]);
                self.pending.drain(..start);
            } else {
                output.append(&mut self.pending);
            }
            break;
        }

        output
    }

    fn finish(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.pending)
    }
}

pub(crate) fn forward_stream_with_controls<R: Read + Send + 'static>(
    mut reader: R,
    window: Window,
    label: String,
    event_name: &'static str,
    stopped: Option<Arc<AtomicBool>>,
    on_finished_event: Option<&'static str>,
    markers: Vec<StreamMarker>,
    on_finished: Option<Arc<dyn Fn() + Send + Sync>>,
) {
    std::thread::spawn(move || {
        use std::sync::mpsc::sync_channel;
        // 有界通道：最多緩衝 128 個 chunk (~128 KB)，防止記憶體無界膨脹
        let (tx, rx) = sync_channel::<Vec<u8>>(128);
        let dropped_bytes = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let dropped_clone = dropped_bytes.clone();
        let stopped_reader = stopped.clone();
        let mut marker_filter = MarkerFilter::new(markers);

        // 讀取執行緒：以阻塞方式讀取 pipe，在隊列滿時丟棄並記錄 dropped，保證快速清空 stdout pipe 避免 Python 子進程卡死
        let reader_thread = std::thread::spawn(move || {
            let mut buf = [0u8; 1024];
            while let Ok(n) = reader.read(&mut buf) {
                if n == 0 {
                    break;
                }
                if let Some(ref st) = stopped_reader {
                    if st.load(Ordering::SeqCst) {
                        break;
                    }
                }
                let chunk = marker_filter.push(&buf[..n]);
                if chunk.is_empty() {
                    continue;
                }
                let chunk_len = chunk.len();
                if let Err(std::sync::mpsc::TrySendError::Full(_)) = tx.try_send(chunk) {
                    dropped_clone.fetch_add(chunk_len, Ordering::Relaxed);
                }
            }
            let remainder = marker_filter.finish();
            if !remainder.is_empty() {
                let n = remainder.len();
                if let Err(std::sync::mpsc::TrySendError::Full(_)) = tx.try_send(remainder) {
                    dropped_clone.fetch_add(n, Ordering::Relaxed);
                }
            }
        });

        // 聚合轉發迴圈：以 30ms 時間窗或批次大小累積發送
        const FLUSH_INTERVAL: Duration = Duration::from_millis(30);
        const BATCH_SIZE_THRESHOLD: usize = 4096;
        let mut pending: Vec<u8> = Vec::new();
        let mut last_emit = Instant::now();

        loop {
            if let Some(ref st) = stopped {
                if st.load(Ordering::SeqCst) {
                    break;
                }
            }

            let timeout = FLUSH_INTERVAL.saturating_sub(last_emit.elapsed());
            match rx.recv_timeout(timeout) {
                Ok(chunk) => {
                    pending.extend_from_slice(&chunk);
                    if pending.len() >= BATCH_SIZE_THRESHOLD || last_emit.elapsed() >= FLUSH_INTERVAL {
                        let tail = utf8_incomplete_tail_len(&pending);
                        let split = pending.len() - tail;
                        if split > 0 {
                            let mut s = String::from_utf8_lossy(&pending[..split]).to_string();
                            let dropped = dropped_bytes.swap(0, Ordering::Relaxed);
                            if dropped > 0 {
                                let warn = format!("\n[Cocoya Warning: 序列埠輸出過於頻繁，已略過約 {} KB 日誌]\n", (dropped + 1023) / 1024);
                                s = warn + &s;
                            }
                            let _ = window.emit_to(&label, event_name, s);
                            pending.drain(..split);
                            last_emit = Instant::now();
                        }
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    if !pending.is_empty() {
                        let tail = utf8_incomplete_tail_len(&pending);
                        let split = pending.len() - tail;
                        if split > 0 {
                            let mut s = String::from_utf8_lossy(&pending[..split]).to_string();
                            let dropped = dropped_bytes.swap(0, Ordering::Relaxed);
                            if dropped > 0 {
                                let warn = format!("\n[Cocoya Warning: 序列埠輸出過於頻繁，已略過約 {} KB 日誌]\n", (dropped + 1023) / 1024);
                                s = warn + &s;
                            }
                            let _ = window.emit_to(&label, event_name, s);
                            pending.drain(..split);
                            last_emit = Instant::now();
                        }
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    // Reader thread 退出 (EOF)
                    break;
                }
            }
        }

        // 清空剩餘資料
        if !pending.is_empty() {
            let mut s = String::from_utf8_lossy(&pending).to_string();
            let dropped = dropped_bytes.swap(0, Ordering::Relaxed);
            if dropped > 0 {
                let warn = format!("\n[Cocoya Warning: 序列埠輸出過於頻繁，已略過約 {} KB 日誌]\n", (dropped + 1023) / 1024);
                s = warn + &s;
            }
            let _ = window.emit_to(&label, event_name, s);
        }

        let _ = reader_thread.join();

        if let Some(finished_event) = on_finished_event {
            let _ = window.emit_to(&label, finished_event, ());
        }
        if let Some(callback) = on_finished {
            callback();
        }
    });
}

#[cfg(test)]
mod marker_filter_tests {
    use super::{MarkerFilter, StreamMarker};
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn filters_markers_split_across_chunks_and_preserves_other_bytes() {
        let hits = Arc::new(AtomicUsize::new(0));
        let marker_hits = hits.clone();
        let mut filter = MarkerFilter::new(vec![StreamMarker {
            token: "__ACTIVE__",
            on_detected: Arc::new(move || { marker_hits.fetch_add(1, Ordering::SeqCst); }),
        }]);

        let mut output = filter.push(b"before __ACT");
        output.extend(filter.push(b"IVE__ after __ACTIVE__"));
        output.extend(filter.finish());

        assert_eq!(output, b"before  after ");
        assert_eq!(hits.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn nonmatching_marker_prefix_is_not_lost() {
        let hits = Arc::new(AtomicUsize::new(0));
        let marker_hits = hits.clone();
        let mut filter = MarkerFilter::new(vec![StreamMarker {
            token: "__ACTIVE__",
            on_detected: Arc::new(move || { marker_hits.fetch_add(1, Ordering::SeqCst); }),
        }]);

        let mut output = filter.push(b"x__ACT");
        output.extend(filter.push(b"IVE_X"));
        output.extend(filter.finish());

        assert_eq!(output, b"x__ACTIVE_X");
        assert_eq!(hits.load(Ordering::SeqCst), 0);
    }

    /// Bug A 回歸（2026-10-08）：Python `print()` 在 Windows 輸出 `\r\n`，
    /// token 尾 `\n` 必須同時吃 `\r\n` 變體，且 marker 本體不漏進終端。
    #[test]
    fn crlf_marker_variant_is_filtered_and_triggers_once() {
        let hits = Arc::new(AtomicUsize::new(0));
        let marker_hits = hits.clone();
        let mut filter = MarkerFilter::new(vec![StreamMarker {
            token: "__COCOYA_SERIAL_CONNECTED__\n",
            on_detected: Arc::new(move || { marker_hits.fetch_add(1, Ordering::SeqCst); }),
        }]);

        let mut output = filter.push(b"log line\r\n__COCOYA_SERIAL_CONNECTED__\r\nmore\r\n");
        output.extend(filter.finish());

        assert_eq!(output, b"log line\r\nmore\r\n");
        assert_eq!(hits.load(Ordering::SeqCst), 1);
    }

    /// LF 原式仍可用（VSIX / POSIX 路徑），且與 CRLF 同 marker 只觸發一次。
    #[test]
    fn lf_marker_still_triggers_only_once() {
        let hits = Arc::new(AtomicUsize::new(0));
        let marker_hits = hits.clone();
        let mut filter = MarkerFilter::new(vec![StreamMarker {
            token: "__COCOYA_SERIAL_CONNECTED__\n",
            on_detected: Arc::new(move || { marker_hits.fetch_add(1, Ordering::SeqCst); }),
        }]);

        let mut output = filter.push(b"__COCOYA_SERIAL_CONNECTED__\n");
        output.extend(filter.push(b"__COCOYA_SERIAL_CONNECTED__\r\n"));
        output.extend(filter.finish());

        assert!(output.is_empty());
        assert_eq!(hits.load(Ordering::SeqCst), 1);
    }

    /// CRLF 被切在 `\r` 與 `\n` 之間時，前綴必須保留到下一 chunk 才判定。
    #[test]
    fn crlf_split_between_cr_and_lf_is_kept_for_next_chunk() {
        let hits = Arc::new(AtomicUsize::new(0));
        let marker_hits = hits.clone();
        let mut filter = MarkerFilter::new(vec![StreamMarker {
            token: "__COCOYA_SERIAL_CONNECTED__\n",
            on_detected: Arc::new(move || { marker_hits.fetch_add(1, Ordering::SeqCst); }),
        }]);

        let mut output = filter.push(b"data __COCOYA_SERIAL_CONNECTED__\r");
        // `data ` 非前綴先輸出；`__MARKER__\r` 是 CRLF 變體前綴，保留到下一 chunk
        assert_eq!(output, b"data ");
        assert_eq!(hits.load(Ordering::SeqCst), 0);
        // 下一 chunk 補 `\n` → 完整 CRLF 變體命中
        output.extend(filter.push(b"\nrest"));
        output.extend(filter.finish());

        assert_eq!(output, b"data rest");
        assert_eq!(hits.load(Ordering::SeqCst), 1);
    }

    /// 孤立 `\r`（非 marker 的普通回車，如進度條 `\r`）不得被吃掉。
    #[test]
    fn lone_cr_without_marker_is_preserved() {
        let hits = Arc::new(AtomicUsize::new(0));
        let marker_hits = hits.clone();
        let mut filter = MarkerFilter::new(vec![StreamMarker {
            token: "__COCOYA_SERIAL_CONNECTED__\n",
            on_detected: Arc::new(move || { marker_hits.fetch_add(1, Ordering::SeqCst); }),
        }]);

        let mut output = filter.push(b"progress 50%\rprogress 100%\r\n");
        output.extend(filter.finish());

        assert_eq!(output, b"progress 50%\rprogress 100%\r\n");
        assert_eq!(hits.load(Ordering::SeqCst), 0);
    }

    /// keep_from 回歸（2026-10-08 實測）：chunk 邊界切在 marker 名字中間時，
    /// 前綴必須整段保留、下一 chunk 補齊後命中，不可漏字。
    /// 病根是 `.rev()` 最短優先：單字 `_` 即命中前綴，只保留 1 byte。
    #[test]
    fn split_inside_marker_name_does_not_leak() {
        let token = b"__COCOYA_SERIAL_CONNECTED__\r\n";
        for cut in 1..token.len() {
            let hits = Arc::new(AtomicUsize::new(0));
            let marker_hits = hits.clone();
            let mut filter = MarkerFilter::new(vec![StreamMarker {
                token: "__COCOYA_SERIAL_CONNECTED__\n",
                on_detected: Arc::new(move || { marker_hits.fetch_add(1, Ordering::SeqCst); }),
            }]);

            let mut stream = b"prefix ".to_vec();
            stream.extend_from_slice(token);
            stream.extend_from_slice(b"suffix");
            let mut output = filter.push(&stream[..7 + cut]);
            output.extend(filter.push(&stream[7 + cut..]));
            output.extend(filter.finish());

            assert_eq!(output, b"prefix suffix", "cut@{cut} leaked");
            assert_eq!(hits.load(Ordering::SeqCst), 1, "cut@{cut} did not trigger");
        }
    }
}