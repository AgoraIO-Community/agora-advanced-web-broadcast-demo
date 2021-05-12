# Agora advanced web brodacast demo
A demo project using the Agora Web RTC and RTM SDKs, leveraging advance RTC features like dual stream with stream fallback, multi-host broadcasting. Web users can mute each other's audio or remove others from the call. Signalling layer is using Agora's RTM SDK.

## Usage
Upload the proejct to a remote server or run locally. This project works across all of the latest browsers that support WebRTC, and runs on both mobile and desktop. For best results use Chromium based browser on desktop, and native browser on mobile. 

### Host/Streamer
```
broadcast.thml
```
Input AppId, temporary token, Channel name, and UID to join stream as broadcaster. Use unique UID's for each broadcast user to avoid issues.


### Audience
```
index.thml
```
Input AppId, temporary token, and Channel name to join stream as audience.