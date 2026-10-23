param([Parameter(Mandatory=$true)][int]$AppProcessId)
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class CaptionTest {
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h,int index);
 [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h,uint msg,IntPtr w,IntPtr l);
}
"@
$p=Get-Process -Id $AppProcessId
$h=$p.MainWindowHandle
if($h -eq 0){throw 'No test window'}
if(([CaptionTest]::GetWindowLong($h,-16) -band 0xC00000) -ne 0xC00000){throw 'Native caption absent'}
$r=New-Object CaptionTest+Rect
[CaptionTest]::GetWindowRect($h,[ref]$r) | Out-Null
$x=$r.Left+200; $y=$r.Top+15
$hit=[CaptionTest]::SendMessage($h,0x84,[IntPtr]::Zero,[IntPtr](($y -shl 16) -bor ($x -band 65535)))
if($hit.ToInt64() -ne 2){throw "Caption hit-test returned $hit, expected HTCAPTION"}
'PASS native WS_CAPTION and HTCAPTION; actual controller dragging requires hardware verification'
