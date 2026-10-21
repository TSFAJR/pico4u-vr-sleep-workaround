use crate::protocol::{Failure, alpha, covering_width};
use libloading::Library;
use raphii_openvr_rs::{Context, TrackedDeviceIndex, overlay::OverlayHandle, pose::Matrix3x4, raw};
use std::ffi::CString;

const KEY: &str = "com.pico4u.sleep.brightness";

pub struct Session {
    context: Context,
    handle: Option<OverlayHandle>,
    system: raw::VR_IVRSystem_FnTable,
    overlays: raw::VR_IVROverlay_FnTable,
    _library: Library,
}

fn failure(error: raphii_openvr_rs::Error) -> Failure {
    use raphii_openvr_rs::Error;
    let code = match &error {
        Error::Load(_) => "dll_missing",
        Error::InterfaceUnavailable { .. } | Error::MissingFunction(_) => "interface_unavailable",
        Error::Runtime {
            interface: "initialization",
            ..
        } => "runtime_unavailable",
        Error::Runtime {
            interface: "overlay",
            code: 17,
        } => "overlay_conflict",
        _ => "overlay_failed",
    };
    Failure::new(code, error)
}

impl Session {
    pub fn connect() -> Result<Self, Failure> {
        let dll = std::env::current_exe()
            .map_err(|e| Failure::new("dll_missing", e))?
            .with_file_name("openvr_api.dll");
        // Only the pinned Valve library beside this helper is loaded. Context
        // owns the session; the extra reference exposes missing safe wrappers.
        let context = unsafe {
            Context::init_from_path(&dll, raw::EVRApplicationType::VRApplication_Background)
        }
        .map_err(failure)?;
        let library = unsafe { Library::new(&dll) }.map_err(|e| Failure::new("dll_missing", e))?;
        let system =
            unsafe { table::<raw::VR_IVRSystem_FnTable>(&library, raw::IVRSystem_Version) }?;
        let overlays =
            unsafe { table::<raw::VR_IVROverlay_FnTable>(&library, raw::IVROverlay_Version) }?;
        Ok(Self {
            context,
            handle: None,
            system,
            overlays,
            _library: library,
        })
    }

    pub fn quit_requested(&self) -> Result<bool, Failure> {
        for _ in 0..64 {
            let Some(event) = self.context.system().poll_next_event().map_err(failure)? else {
                break;
            };
            if event.is(raw::EVREventType::VREvent_Quit) {
                if let Some(ack) = self.system.AcknowledgeQuit_Exiting {
                    unsafe { ack() };
                }
                return Ok(true);
            }
        }
        // Also detects a lost HMD/runtime when no quit event was delivered.
        let connected = self
            .system
            .IsTrackedDeviceConnected
            .ok_or_else(|| Failure::new("interface_unavailable", "IsTrackedDeviceConnected"))?;
        Ok(!unsafe { connected(0) })
    }

    pub fn prepare(&mut self) -> Result<(), Failure> {
        if self.handle.is_some() {
            return Ok(());
        }
        let handle = self
            .context
            .overlays()
            .create_overlay(KEY, "PICO4U SteamVR Brightness")
            .map_err(failure)?;
        self.handle = Some(handle); // Every subsequent error is cleaned by Drop.
        let manager = self.context.overlays();
        manager.set_visibility(handle, false).map_err(failure)?;
        manager
            .set_raw_data(handle, &[0, 0, 0, 255], 1, 1, 4)
            .map_err(failure)?;
        manager
            .set_transform_tracked_device_relative(
                handle,
                TrackedDeviceIndex::HMD,
                &Matrix3x4([[1., 0., 0., 0.], [0., 1., 0., 0.], [0., 0., 1., -0.15]]),
            )
            .map_err(failure)?;
        manager.set_sort_order(handle, 200).map_err(failure)?;
        manager.set_opacity(handle, 0.0).map_err(failure)?;
        let mut raw_handle = 0;
        let key = CString::new(KEY).unwrap();
        let find = self
            .overlays
            .FindOverlay
            .ok_or_else(|| Failure::new("interface_unavailable", "FindOverlay"))?;
        let no_input = self
            .overlays
            .SetOverlayInputMethod
            .ok_or_else(|| Failure::new("interface_unavailable", "SetOverlayInputMethod"))?;
        check(unsafe { find(key.as_ptr().cast_mut(), &mut raw_handle) }.0)?;
        check(unsafe { no_input(raw_handle, raw::VROverlayInputMethod::None) }.0)?;
        self.resize()
    }

    pub fn resize(&self) -> Result<(), Failure> {
        let Some(handle) = self.handle else {
            return Ok(());
        };
        let projection = self
            .system
            .GetProjectionRaw
            .ok_or_else(|| Failure::new("interface_unavailable", "GetProjectionRaw"))?;
        let transform = self
            .system
            .GetEyeToHeadTransform
            .ok_or_else(|| Failure::new("interface_unavailable", "GetEyeToHeadTransform"))?;
        let eyes = std::array::from_fn(|i| {
            let eye = if i == 0 {
                raw::EVREye::Eye_Left
            } else {
                raw::EVREye::Eye_Right
            };
            let (mut left, mut right, mut top, mut bottom) = (0.0, 0.0, 0.0, 0.0);
            unsafe { projection(eye, &mut left, &mut right, &mut top, &mut bottom) };
            ([left, right, top, bottom], unsafe { transform(eye) }.m)
        });
        let width = covering_width(&eyes).map_err(|e| Failure::new("projection_failed", e))?;
        self.context
            .overlays()
            .set_width(handle, width)
            .map_err(failure)
    }

    pub fn apply(&self, percent: u8) -> Result<(), Failure> {
        if let Some(handle) = self.handle {
            let manager = self.context.overlays();
            if percent == 100 {
                manager.set_visibility(handle, false).map_err(failure)?;
            } else {
                manager
                    .set_opacity(handle, alpha(percent))
                    .map_err(failure)?;
                manager.set_visibility(handle, true).map_err(failure)?;
            }
        }
        Ok(())
    }
    pub fn clear_overlay(&mut self) {
        if let Some(handle) = self.handle.take() {
            let _ = self.context.overlays().set_visibility(handle, false);
            let _ = self.context.overlays().destroy_overlay(handle);
        }
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        self.clear_overlay();
        self.context.shutdown();
    }
}

fn check(code: i32) -> Result<(), Failure> {
    if code == 0 {
        Ok(())
    } else {
        Err(Failure::new(
            "overlay_failed",
            format!("OpenVR overlay error {code}"),
        ))
    }
}

unsafe fn table<T: Copy>(library: &Library, version: &[u8]) -> Result<T, Failure> {
    type GetInterface =
        unsafe extern "C" fn(*const std::ffi::c_char, *mut i32) -> *mut std::ffi::c_void;
    let get = unsafe { library.get::<GetInterface>(b"VR_GetGenericInterface\0") }
        .map_err(|e| Failure::new("interface_unavailable", e))?;
    let mut name = b"FnTable:".to_vec();
    name.extend_from_slice(version);
    let mut error = 0i32;
    let ptr = unsafe { get(name.as_ptr().cast(), &mut error) };
    if error != 0 || ptr.is_null() {
        return Err(Failure::new(
            "interface_unavailable",
            format!("interface error {error}"),
        ));
    }
    Ok(unsafe { ptr.cast::<T>().read_unaligned() })
}
