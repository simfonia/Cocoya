/**
 * Time i18n: en.js
 * English messages for Time blocks.
 */

Object.assign(Blockly.Msg, {
  // Blocks
  "TIME_SLEEP": "time.sleep( %1 )  # seconds",
  "TIME_SLEEP_TOOLTIP": "Pause the program for a specified number of seconds.",

  "TIME_NOW": "time.time()  # current timestamp",
  "TIME_NOW_TOOLTIP": "Get the current time as a Unix timestamp (seconds since epoch).",

  "TIME_MONOTONIC": "time.monotonic()  # system boot seconds",
  "TIME_MONOTONIC_TOOLTIP": "Get the seconds since system boot. Useful for measuring intervals without being affected by system time changes.",

  "TIME_LOCALTIME": "time.localtime( %1 )",
  "TIME_LOCALTIME_TOOLTIP": "Convert a Unix timestamp to a struct_time object representing local time.",

  "TIME_STRFTIME": "time.strftime( %1, %2 )",
  "TIME_STRFTIME_TOOLTIP": "Format a struct_time object into a string. Use standard strftime format codes (e.g., '%%Y-%%m-%%d %%H:%%M:%%S')."
});
