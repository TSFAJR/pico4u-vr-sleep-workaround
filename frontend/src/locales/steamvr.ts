export const steamVrEn = {
  steamvr_decrease: 'Decrease by 1%',
  steamvr_increase: 'Increase by 1%',
  steamvr_auto_dim_percent: 'SteamVR auto-dim brightness preset',
  steamvr_auto_dim: 'Also adjust SteamVR brightness when auto-dimming',
  steamvr_auto_dim_note:
    'This preset is independent of homepage brightness. Editing it does not change the VR view. Apply saves it; Cancel discards changes. At the auto-dim deadline, enable SteamVR control at this preset. A delay of 0 disables auto-dimming. Use the homepage Restore 100% button to restore the view.',
  steamvr_title: 'SteamVR Software Brightness',
  steamvr_enable: 'Enable SteamVR brightness control',
  steamvr_percent: 'Brightness',
  steamvr_restore: 'Restore 100% and disable',
  steamvr_applied: 'Applied: {{percent}}%',
  steamvr_phase_disabled: 'Control disabled; start SteamVR before enabling',
  steamvr_phase_updating: 'Updating SteamVR control…',
  steamvr_phase_waiting: 'SteamVR unavailable; waiting to reconnect',
  steamvr_phase_active: 'Connected to SteamVR',
  steamvr_phase_error: 'SteamVR control failed',
  steamvr_save_error: 'Could not save brightness (recovery remains available)',
  steamvr_save_again: 'Save again',
  steamvr_live_note:
    'Homepage brightness applies and saves immediately, independently of the auto-dim preset. When disabled, the slider only saves the next manual brightness.',
  steamvr_safety_note:
    '0% can obscure the VR view. Restore from this Windows window or close this tool. SteamVR restarts restore this session’s enabled setting; reopening this tool always starts disabled. No PICO backlight or ADB changes. Avoid combining with OyasumiVR dimming.',
  steamvr_error_runtime_unavailable:
    'SteamVR is not running or the headset is unavailable. Start VD and SteamVR; reconnection is automatic.',
  steamvr_error_dll_missing:
    'The OpenVR DLL is missing or could not be loaded. Reinstall the complete application.',
  steamvr_error_interface_unavailable:
    'This SteamVR runtime does not provide the required OpenVR interface.',
  steamvr_error_overlay_conflict:
    'Another instance already owns this brightness overlay. Close the other instance.',
  steamvr_error_overlay_failed:
    'The OpenVR overlay operation failed. See the technical reason below.',
  steamvr_error_projection_failed: 'Could not calculate safe coverage for both eyes.',
  steamvr_error_helper_missing:
    'Could not start the brightness helper. Reinstall the complete application.',
  steamvr_error_helper_timeout:
    'The brightness helper did not respond. Recovery terminates only this helper.',
  steamvr_error_helper_exited: 'The brightness helper stopped unexpectedly.',
  steamvr_error_helper_protocol: 'Invalid response from the brightness helper.',
  steamvr_error_helper_job: 'Windows could not isolate the brightness helper safely.',
  steamvr_error_restart_limit:
    'Automatic retries paused after repeated helper failures. Press Retry.',
}

export const steamVrZh: Record<keyof typeof steamVrEn, string> = {
  steamvr_decrease: '降低 1%',
  steamvr_increase: '提高 1%',
  steamvr_auto_dim_percent: 'SteamVR 自动调暗亮度预设',
  steamvr_auto_dim: '自动调暗时同步调整 SteamVR 亮度',
  steamvr_auto_dim_note:
    '此预设与主页即时亮度独立，修改时不会改变 VR 画面；需“应用”保存，“取消”不保存。到达自动调暗时间时启用 SteamVR 控制并应用此预设；延迟为 0 时不触发。请通过主页“恢复 100%”恢复画面。',
  steamvr_title: 'SteamVR 软件亮度控制',
  steamvr_enable: '启用 SteamVR 亮度控制',
  steamvr_percent: '亮度',
  steamvr_restore: '恢复 100% 并关闭控制',
  steamvr_applied: '实际应用：{{percent}}%',
  steamvr_phase_disabled: '控制已关闭；启用前请先启动 SteamVR',
  steamvr_phase_updating: '正在更新 SteamVR 控制…',
  steamvr_phase_waiting: 'SteamVR 或头显不可用，正在等待重新连接',
  steamvr_phase_active: '已连接 SteamVR',
  steamvr_phase_error: 'SteamVR 控制失败',
  steamvr_save_error: '亮度保存失败（仍可恢复画面）',
  steamvr_save_again: '再次保存',
  steamvr_live_note:
    '主页亮度即时生效并保存，与自动调暗预设独立。控制关闭时，滑块仅保存下次手动使用的亮度。',
  steamvr_safety_note:
    '0% 可能遮挡全部 VR 视野，请通过本 Windows 窗口恢复亮度或退出工具。本次启用后，SteamVR 重启会自动恢复调暗；重新打开本工具时默认关闭。不调整 PICO 背光或 ADB 功能。请勿与 OyasumiVR 调光叠加使用。',
  steamvr_error_runtime_unavailable:
    'SteamVR 未运行或头显不可用。请启动 VD 和 SteamVR，工具会自动重连。',
  steamvr_error_dll_missing: 'OpenVR DLL 缺失或加载失败，请重新安装完整程序。',
  steamvr_error_interface_unavailable: '当前 SteamVR 不提供所需的 OpenVR 接口。',
  steamvr_error_overlay_conflict: '另一程序实例已占用亮度遮罩，请关闭另一个实例。',
  steamvr_error_overlay_failed: 'OpenVR 遮罩操作失败，具体原因见下方技术信息。',
  steamvr_error_projection_failed: '无法计算覆盖双眼的安全遮罩尺寸。',
  steamvr_error_helper_missing: '无法启动亮度辅助程序，请重新安装完整程序。',
  steamvr_error_helper_timeout: '亮度辅助程序未响应；恢复操作会仅终止该辅助程序。',
  steamvr_error_helper_exited: '亮度辅助程序意外退出。',
  steamvr_error_helper_protocol: '亮度辅助程序返回了无效信息。',
  steamvr_error_helper_job: 'Windows 无法安全隔离亮度辅助程序。',
  steamvr_error_restart_limit: '辅助程序连续失败，已暂停自动重试。请点击“重试”。',
}

export const steamVrJa: Record<keyof typeof steamVrEn, string> = {
  steamvr_decrease: '1% 下げる',
  steamvr_increase: '1% 上げる',
  steamvr_auto_dim_percent: 'SteamVR 自動減光の輝度プリセット',
  steamvr_auto_dim: '自動減光時に SteamVR の輝度も調整する',
  steamvr_auto_dim_note:
    'ホーム画面の即時輝度とは独立したプリセットです。編集しても VR 画面は変化しません。「変更を適用」で保存し、「キャンセル」で破棄します。自動減光の時刻に SteamVR 制御を有効にしてこの値を適用します。遅延が 0 の場合は作動しません。ホーム画面の 100% に戻すボタンで復元してください。',
  steamvr_title: 'SteamVR ソフトウェア輝度',
  steamvr_enable: 'SteamVR の輝度制御を有効にする',
  steamvr_percent: '明るさ',
  steamvr_restore: '100% に戻して制御を無効化',
  steamvr_applied: '適用値：{{percent}}%',
  steamvr_phase_disabled: '制御は無効です。有効化する前に SteamVR を起動してください',
  steamvr_phase_updating: 'SteamVR の制御を更新中…',
  steamvr_phase_waiting: 'SteamVR またはヘッドセットが利用できません。再接続を待っています',
  steamvr_phase_active: 'SteamVR に接続済み',
  steamvr_phase_error: 'SteamVR の制御に失敗しました',
  steamvr_save_error: '輝度を保存できませんでした（画面の復元は可能です）',
  steamvr_save_again: '再保存',
  steamvr_live_note:
    'ホーム画面の輝度は即時に適用・保存され、自動減光プリセットとは独立しています。制御が無効の場合は次回の手動輝度のみを保存します。',
  steamvr_safety_note:
    '0% は VR 視野を覆う場合があります。この Windows 画面で復元するか、本ツールを終了してください。SteamVR の再起動後は今回の制御を自動復元しますが、本ツールの起動時は常に無効です。PICO のバックライトと ADB は変更しません。OyasumiVR の調光と併用しないでください。',
  steamvr_error_runtime_unavailable:
    'SteamVR が未起動、またはヘッドセットが利用できません。VD と SteamVR を起動すると自動で再接続します。',
  steamvr_error_dll_missing:
    'OpenVR DLL が見つからないか読み込めません。アプリを再インストールしてください。',
  steamvr_error_interface_unavailable:
    '現在の SteamVR は必要な OpenVR インターフェースを提供していません。',
  steamvr_error_overlay_conflict: '別のアプリインスタンスが輝度オーバーレイを使用しています。',
  steamvr_error_overlay_failed:
    'OpenVR オーバーレイの操作に失敗しました。下の詳細を確認してください。',
  steamvr_error_projection_failed: '両眼を覆う安全なサイズを計算できませんでした。',
  steamvr_error_helper_missing:
    '輝度ヘルパーを起動できません。アプリを再インストールしてください。',
  steamvr_error_helper_timeout:
    '輝度ヘルパーが応答しません。復元時にはこのヘルパーのみを終了します。',
  steamvr_error_helper_exited: '輝度ヘルパーが予期せず終了しました。',
  steamvr_error_helper_protocol: '輝度ヘルパーから無効な応答を受信しました。',
  steamvr_error_helper_job: 'Windows が輝度ヘルパーを安全に隔離できませんでした。',
  steamvr_error_restart_limit:
    '失敗が続いたため自動再試行を停止しました。「再試行」を押してください。',
}
