---
name: Reolink camera setup
description: Current camera/NVR topology and constraints for adding Reolink access to Quick Pass.
---

Quick Pass has a standalone Reolink Argus PT (hardware BIPC_566MIX16M35SD965MP). The business has a separate NVR; the Argus PT is listed on its own in Reolink and is not an NVR channel. The user has not identified a Reolink Home Hub. For now, Quick Pass should link to Reolink's official software and must not claim to stream, control, or store the camera feed.

**Why:** the user confirmed the camera is standalone and selected a Reolink launch panel because the NVR does not contain the Argus PT.

**How to apply:** Keep the distinction between camera microSD, Home Hub, and NVR storage explicit. Any future in-app viewer needs a supported Reolink access path and safe network reachability; never request or display camera credentials in chat.
