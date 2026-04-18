/**
 * Time i18n: zh-hant.js
 * Traditional Chinese messages for Time blocks.
 */

Object.assign(Blockly.Msg, {
  // Blocks
  "TIME_SLEEP": "暫停 %1 秒",
  "TIME_SLEEP_TOOLTIP": "暫停程式執行指定的秒數。",

  "TIME_NOW": "目前時間戳",
  "TIME_NOW_TOOLTIP": "取得目前的 Unix 時間戳 (自 epoch 以來的秒數)。",

  "TIME_MONOTONIC": "系統開機秒數",
  "TIME_MONOTONIC_TOOLTIP": "取得系統啟動後的秒數。常用於計算時間差，且不受系統時間調整影響。",

  "TIME_LOCALTIME": "從 %1 轉換為本地時間",
  "TIME_LOCALTIME_TOOLTIP": "將 Unix 時間戳轉換為代表本地時間的 struct_time 物件。",

  "TIME_STRFTIME": "將 %2 格式化為 %1",
  "TIME_STRFTIME_TOOLTIP": "將 struct_time 物件格式化為字串。使用標準 strftime 格式碼 (例如：'%%Y-%%m-%%d %%H:%%M:%%S')。"
});
