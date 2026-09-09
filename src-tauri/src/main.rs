// Release builds run as a GUI process: no console window on the taskbar. Debug builds keep it for logs.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() { hana_forever_lib::run(); }
