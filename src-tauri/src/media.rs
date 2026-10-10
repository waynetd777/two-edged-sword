// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

//! The keyboard's media keys (F7 ⏮, F8 ⏯, F9 ⏭), headphone buttons and Control Centre's Now
//! Playing, for reading aloud. macOS sends these to the app it thinks is playing, so the page says
//! what is being read and whether it is playing; the keys come back as "media" events ("toggle",
//! "play", "pause", "next", "previous").

use tauri::AppHandle;

mod mac {
    use block2::RcBlock;
    use objc2::runtime::AnyObject;
    use objc2_foundation::{NSDictionary, NSString};
    use objc2_media_player::{
        MPMediaItemPropertyTitle, MPNowPlayingInfoCenter, MPNowPlayingPlaybackState, MPRemoteCommand, MPRemoteCommandCenter,
        MPRemoteCommandEvent, MPRemoteCommandHandlerStatus,
    };
    use std::ptr::NonNull;
    use std::sync::Once;
    use tauri::{AppHandle, Emitter};

    static WIRED: Once = Once::new();

    fn wire(app: &AppHandle) {
        WIRED.call_once(|| unsafe {
            let c = MPRemoteCommandCenter::sharedCommandCenter();
            let on = |cmd: &MPRemoteCommand, name: &'static str| {
                let a = app.clone();
                let h = RcBlock::new(move |_: NonNull<MPRemoteCommandEvent>| {
                    let _ = a.emit("media", name);
                    MPRemoteCommandHandlerStatus::Success
                });
                cmd.setEnabled(true);
                // The command centre keeps the handler for the life of the app.
                cmd.addTargetWithHandler(&h);
            };
            on(&c.togglePlayPauseCommand(), "toggle");
            on(&c.playCommand(), "play");
            on(&c.pauseCommand(), "pause");
            on(&c.nextTrackCommand(), "next");
            on(&c.previousTrackCommand(), "previous");
        });
    }

    pub fn state(app: &AppHandle, title: Option<String>, playing: bool) {
        let a = app.clone();
        let _ = app.run_on_main_thread(move || unsafe {
            wire(&a);
            let np = MPNowPlayingInfoCenter::defaultCenter();
            match title {
                Some(t) => {
                    let t = NSString::from_str(&t);
                    let info = NSDictionary::<NSString, AnyObject>::from_slices(&[MPMediaItemPropertyTitle], &[&*t as &AnyObject]);
                    np.setNowPlayingInfo(Some(&info));
                    np.setPlaybackState(if playing { MPNowPlayingPlaybackState::Playing } else { MPNowPlayingPlaybackState::Paused });
                }
                None => {
                    np.setNowPlayingInfo(None);
                    np.setPlaybackState(MPNowPlayingPlaybackState::Stopped);
                }
            }
        });
    }
}

/// What is being read (`title`; none when nothing is) and whether it is playing or paused.
#[tauri::command]
pub fn media_state(app: AppHandle, title: Option<String>, playing: bool) {
    mac::state(&app, title, playing);
}
