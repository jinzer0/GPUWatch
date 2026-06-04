# GPUWatcher

macOS에서 SSH로 Linux NVIDIA GPU 서버 상태를 확인하는 Tauri 데스크톱 유틸리티입니다.

## Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
- [Features](#features)
- [Prerequisites](#prerequisites)

## Overview

GPUWatcher는 여러 Linux NVIDIA GPU 서버의 최신 GPU 상태와 프로세스 정보를 macOS 앱에서 확인하기 위한 프로젝트입니다.
원격 서버에 별도 수집기를 설치하지 않고, 시스템 `ssh`로 고정된 `nvidia-smi`와 `ps` 명령을 실행한 뒤 결과를 로컬에서 파싱합니다.
수집된 데이터는 backend에서 protocol v1 스냅샷으로 정리되며, 서버 설정과 최신 성공 스냅샷은 로컬 SQLite에 저장됩니다.
GPU 서버의 현재 사용 가능 여부와 프로세스 점유 상태를 빠르게 확인하는 데 초점을 둡니다.

## Getting Started

저장소를 로컬에 받은 뒤 프로젝트 디렉터리에서 의존성을 설치합니다.

```bash
npm install
```

macOS 데스크톱 앱을 개발 모드로 실행합니다.

```bash
npm run tauri dev
```

프론트엔드만 브라우저에서 확인하려면 다음 명령을 사용할 수 있습니다.

```bash
npm run dev
```

로컬 테스트와 빌드는 다음 명령으로 확인합니다.

```bash
cargo test --manifest-path src-tauri/Cargo.toml
npm run test
npm run build
```

## Features

- SSH 기반으로 Linux NVIDIA GPU 서버의 최신 GPU 상태를 수집합니다.
- 원격 서버에 GPUWatcher, nvitop, Python 수집기, 저장소 파일을 설치하지 않아도 됩니다.
- `nvidia-smi` 기반 GPU 메모리, 사용률, 온도, 전력 정보를 표시합니다.
- 선택적 `gpu_extra_csv`, `mig_list`, `dmon`, `dmon_pcie`, `pmon`, `ps` 섹션이 가능하면 더 풍부한 지표와 프로세스 정보를 더합니다.
- 선택 섹션 실패는 기본 GPU CSV가 성공하면 치명적 오류가 아니라 경고와 `unknown` 또는 `null` 값으로 표시됩니다.
- Overview, Server Detail, Process Table, Settings 화면으로 서버 상태를 확인하고 관리합니다.
- Process Table은 Flat 보기와 현재 보이는 GPU 프로세스만 묶는 Parent grouped 보기를 제공하며, 키보드 이동과 읽기 전용 프로세스 상세 drawer를 지원합니다.
- 프로세스 행에는 런타임, SM, 메모리, encoder, decoder 사용률처럼 가능한 선택 지표를 표시하고, 빠진 값은 `unknown` 또는 `null`로 둡니다.
- Display mode의 Full과 Compact 전환은 현재 앱 세션에만 적용되며, 앱을 다시 시작하면 기본 Full 보기로 돌아갑니다.
- Server Detail의 라이브 미니 차트는 성공 스냅샷만 메모리에 최대 120개 보관하는 세션 전용 기록이며, 앱을 다시 시작하면 초기화됩니다.
- 실패한 새로고침 이후에도 최신 성공 스냅샷을 보존하고 stale 상태와 오류 정보를 표시합니다. 실패한 poll은 라이브 차트 샘플을 추가하지 않습니다.

## Prerequisites

| 구분 | 필요 항목 |
|---|---|
| Local | macOS |
| Runtime | Node.js 24 이상, npm, Rust 1.95 이상, SQLite 3 |
| Remote GPU server | Linux NVIDIA 드라이버, `nvidia-smi`, POSIX shell, `ps` |
| SSH | macOS에서 원격 서버로 접속 가능한 키 기반 SSH |

원격 서버는 비대화형 SSH로 접근 가능해야 합니다. 비밀번호 인증 UI는 v0.1 범위에 포함되지 않으며, 패스프레이즈가 있는 키는 `ssh-agent`에서 먼저 잠금 해제해 주세요.

```bash
ssh -o BatchMode=yes USER@HOST true
```

`nvidia-smi` 출력은 드라이버, GPU 모드, MIG 구성에 따라 `N/A` 또는 `-`를 반환할 수 있습니다. MIG 인스턴스 수, PCIe 처리량, process utilization, 런타임 같은 선택 지표도 서버와 드라이버마다 빠지거나 달라질 수 있습니다. GPUWatcher는 이런 값을 0으로 바꾸지 않고 `unknown` 또는 `null`로 처리합니다. nvitop은 참고 기준일 뿐이며, GPUWatcher는 원격 nvitop 실행이나 정확한 NVML plus psutil 동등성을 목표로 하지 않습니다.
