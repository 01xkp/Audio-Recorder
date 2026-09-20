# KVM Ubuntu Deployment

This browser-only application is deployed separately from Task-assignment.

| Item | Value |
| --- | --- |
| VM | `192.168.122.243` (`huggingface-243`) |
| Deployment user | `gutta` |
| Application directory | `/home/gutta/audio-recorder` |
| systemd user service | `audio-recorder.service` |
| HTTP port | `5177` |

The service only serves the static site. Audio files and generated fragments remain in the visitor's browser and are never uploaded to the VM.

## Release

From a verified local checkout:

```powershell
npm test
npm run build
git archive --format=tar --output audio-recorder-release.tar HEAD
scp audio-recorder-release.tar gutta@192.168.122.243:~/
```

On the VM:

```bash
mkdir -p ~/audio-recorder
tar -xf ~/audio-recorder-release.tar -C ~/audio-recorder
cd ~/audio-recorder
npm ci
npm run build
npm test
mkdir -p ~/.config/systemd/user
install -m 644 deploy/audio-recorder.service ~/.config/systemd/user/audio-recorder.service
systemctl --user daemon-reload
systemctl --user enable --now audio-recorder.service
systemctl --user restart audio-recorder.service
rm ~/audio-recorder-release.tar
```

## Verification

```bash
systemctl --user is-active audio-recorder.service
curl --fail --silent --show-error --head http://127.0.0.1:5177/
curl --fail --silent --show-error --head http://127.0.0.1:5177/ffmpeg/ffmpeg-core.js
curl --fail --silent --show-error --head http://127.0.0.1:5177/ffmpeg/ffmpeg-core.wasm
```

From the LAN, open `http://192.168.122.243:5177/`. The user service is configured to persist after logout because `gutta` has systemd lingering enabled. Do not modify or restart `task-assignment.service` while deploying this application.
