---
name: Reolink camera setup
description: Current camera/NVR topology and constraints for adding Reolink access to Quick Pass.
---

Quick Pass has a standalone Reolink Argus PT (hardware BIPC_566MIX16M35SD965MP). The business has a separate NVR; the Argus PT is listed on its own in Reolink and is not an NVR channel. The user has not identified a Reolink Home Hub. The user requires the camera to display inside Quick Pass; an external Reolink software link is not the desired final result.

**Why:** the user clarified after the launch panel was added: "the camera should display in app."

**How to apply:** Keep the distinction between camera microSD, Home Hub, and NVR storage explicit. Check current official compatibility against the exact NVR hardware and firmware: Reolink lists this Argus PT revision as upgradable for some NVRs as well as Home Hubs. Do not assume a Home Hub is the only route. An in-app viewer needs a supported video source and safe network reachability; never request or display camera credentials in chat. Explain the change to standalone access before adding a battery camera to an NVR.
