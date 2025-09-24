
# 🎓 Hatch OS v1.2.0

**Lightweight, secure, and student-focused operating system** built on Debian Linux with a custom React + Electron interface. Designed for handheld devices and educational environments.

---

## 🚀 Key Features

- **Kiosk Mode**: Boots directly into Hatch OS interface  
- **Multi-Factor Authentication**: ID + Password + PIN/OTP security  
- **Cloud Sync**: Automatic data synchronization every 2 seconds  
- **Distraction-Free Mode**: Blocks entertainment apps  
- **Pre-installed Educational Apps**: Browser, Notes, Code Editor, Classroom tools  
- **Real-Time Monitoring**: System performance and security  
- **Hardware Optimized**: Raspberry Pi and low-power device support  

---

## 🏗️ System Architecture

```
Frontend (React + Electron)
 ├─ LoginScreen (MFA)
 ├─ Dashboard (System Overview)
 ├─ AppLauncher (Manage Apps)
 └─ AdminPanel (User Management)

Backend (Node.js + Express)
 ├─ Authentication
 ├─ Cloud Sync
 ├─ System Monitor
 └─ Real-Time Communication (Socket.IO)

System Layer (Debian Linux + Custom Services)
 ├─ Kiosk Mode
 ├─ Hardware Optimization
 └─ Educational App Integration
```

---

## 💻 Quick Start

### Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| RAM       | 1GB     | 2GB+        |
| Storage   | 8GB     | 16GB+       |
| CPU       | 1 Core 1GHz | 2 Core 1.5GHz+ |
| OS        | Debian 11+ / Ubuntu 20.04+ | Latest LTS |

### Installation

```bash
# Download and extract
wget https://releases.zylonlabs.com/hatch-os/hatch-os-v1.0.0.tar.gz
tar -xzf hatch-os-v1.0.0.tar.gz
cd hatch-os

# Run installer
sudo bash scripts/install-hatch-os.sh
sudo reboot
```

### Default Credentials

| Role | Username | Password | PIN |
|------|----------|----------|-----|
| Admin | admin | admin123 | 123456 |
| Student | student1 | student123 | 111111 |

> ⚠️ Change default credentials after first login.

---

## 🛠️ Development

### Prerequisites

- Node.js 16+ & npm 8+  
- Python 3.8+ (for native modules)  
- Git  

### Local Setup

```bash
git clone https://github.com/Jagrit0711/hatchos.git
cd hatchos
npm install
npm run dev
```

- Frontend: http://localhost:3000  
- Backend API: http://localhost:3001  

### Build & Package

```bash
npm run build         # Build frontend
npm run build-system  # Build system package
npm run package       # Create installation package
```

---

## 📱 Pre-installed Apps

| App | Purpose |
|-----|---------|
| Web Browser | Secure browsing |
| Notes | Note-taking |
| Code Editor | Lightweight coding |
| Classroom | Interactive learning |
| Whiteboard | Presentations & drawings |
| Quiz App | Tests & assessments |

---

## 🔒 Security

- Multi-factor authentication (ID + Password + PIN/OTP)  
- Real-time intrusion detection & monitoring  
- Encrypted local storage & secure cloud sync  
- Automatic security updates  

---

## 🤝 Contributing

1. Fork repository  
2. Create feature branch: `git checkout -b feature/new-feature`  
3. Commit changes: `git commit -m "Add feature"`  
4. Push branch: `git push origin feature/new-feature`  
5. Open Pull Request  

---

## 📜 License

MIT License. See [LICENSE](LICENSE) for details.
