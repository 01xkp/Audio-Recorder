# KVM Ubuntu Deployment

This browser-only application is deployed separately from Task-assignment.

| Item | Value |
| --- | --- |
| VM | `192.168.122.243` (`huggingface-243`) |
| Deployment user | `gutta` |
| Application directory | `/home/gutta/audio-recorder` |
| systemd service | `audio-recorder.service` |
| HTTP port | `5175` |

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
sudo tee /etc/systemd/system/audio-recorder.service >/dev/null <<'EOF'
[Unit]
Description=Audio Recorder Splitter
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=gutta
WorkingDirectory=/home/gutta/audio-recorder
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now audio-recorder.service
sudo systemctl restart audio-recorder.service
rm ~/audio-recorder-release.tar
```

## Verification

```bash
systemctl is-active audio-recorder.service
curl --fail --silent --show-error --head http://127.0.0.1:5175/
curl --fail --silent --show-error --head http://127.0.0.1:5175/ffmpeg/ffmpeg-core.js
curl --fail --silent --show-error --head http://127.0.0.1:5175/ffmpeg/ffmpeg-core.wasm
```

From the LAN, open `http://192.168.122.243:5175/`. Do not modify or restart `task-assignment.service` while deploying this application.
