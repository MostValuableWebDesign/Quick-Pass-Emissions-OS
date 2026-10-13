---
name: Reolink camera setup
description: Current camera/NVR topology and constraints for adding Reolink access to Quick Pass.
---

Quick Pass has a standalone Reolink Argus PT (hardware BIPC_566MIX16M35SD965MP). The user confirmed there is no Home Hub and asked to drop the NVR setup. The user wants live video inside Quick Pass, but the camera is currently standalone.

**Why:** the user clarified that the current external Reolink launcher does not meet the in-app viewing goal, then declined the Home Hub route because they do not have one.

**How to apply:** Do not implement a pretend or unsupported live feed for the standalone battery camera. Reolink's supported third-party stream protocols require a compatible Hub for this camera; without one, the official Reolink app/client link is the supported option. Revisit in-app video only if the user chooses a supported video source and secure network bridge. Never request or display camera credentials in chat.
