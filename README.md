# GPUWatcher

macOS에서 Linux NVIDIA GPU 서버의 최신 GPU 상태와 프로세스 정보를 확인하는 Tauri 데스크톱 유틸리티입니다.

GPUWatcher는 원격 서버에 별도 수집기를 설치하지 않습니다. macOS 앱이 시스템 `ssh`로 접속해 고정된 POSIX 셸 명령을 실행하고, `nvidia-smi`와 `ps`의 섹션별 출력을 로컬에서 파싱합니다. 백엔드는 이 결과로 protocol v1 스냅샷을 만들고, 서버 설정과 최신 성공 스냅샷을 로컬 SQLite에 저장합니다.

## 주요 기능

- 여러 Linux NVIDIA GPU 서버의 최신 GPU 상태를 macOS 데스크톱 앱에서 확인
- 원격 서버에 GPUWatcher, nvitop, Python 수집기, 저장소 파일 설치 없이 SSH로 수집
- `nvidia-smi --query-gpu` 기반 GPU 인벤토리, 메모리, 사용률, 온도, 전력 정보 표시
- `nvidia-smi --query-compute-apps`, 선택적 `nvidia-smi pmon`, 선택적 `nvidia-smi dmon`, `ps`를 조합한 GPU 프로세스 정보 표시
- Overview, Server Detail, Process Table, Settings 화면에서 백엔드 DTO 기반 데이터 렌더링
- 실패한 새로고침이 있어도 최신 성공 스냅샷을 보존하고 상태와 경고를 함께 표시

## 원격 서버 요구 사항

각 GPU 서버에는 다음만 필요합니다.

- Linux NVIDIA 드라이버와 `PATH`에서 실행 가능한 `nvidia-smi`
- SSH 로그인 사용자에게 제공되는 POSIX 셸
- 프로세스 보강 정보를 위한 `ps`
- GPUWatcher를 실행하는 macOS에서 접근 가능한 키 기반 SSH

원격 서버에는 GPUWatcher, nvitop, Python 수집기, 별도 collector 패키지, 이 저장소의 파일을 설치할 필요가 없습니다. 앱은 비대화형 시스템 `ssh`를 사용하므로 비밀번호 프롬프트는 v0.1 범위에 포함되지 않습니다. 패스프레이즈가 있는 키는 새로고침 전에 `ssh-agent`에서 잠금 해제해 주세요.

## 수집 방식

GPUWatcher는 새로고침 시 다음 원격 명령 출력을 사용합니다.

- GPU CSV, `nvidia-smi --query-gpu=... --format=csv,noheader,nounits`
- GPU 프로세스, `nvidia-smi --query-compute-apps=... --format=csv,noheader,nounits`
- 선택적 프로세스 샘플, `nvidia-smi pmon`
- 선택적 디바이스 샘플, `nvidia-smi dmon`
- 사용자, 명령, 인자 보강 정보, `ps`

기본 GPU CSV 쿼리는 필수입니다. `compute-apps`, `pmon`, `dmon`, `ps`는 프로세스와 사용률 정보를 더 풍부하게 만들지만, 일부 드라이버, GPU 모드, MIG 구성에서는 지원되지 않을 수 있습니다. 선택 섹션 실패는 가능한 경우 경고와 nullable 필드로 처리됩니다.

공식 `nvidia-smi` 출력은 드라이버와 GPU 상태에 따라 `N/A` 또는 `-`를 반환할 수 있습니다. GPUWatcher는 이렇게 노출되지 않은 값을 0으로 바꾸지 않고 unknown 또는 `null`로 다룹니다.

## 설치와 개발 실행

개발 환경 요구 사항은 다음과 같습니다.

- Node.js 24 이상
- Rust 1.95 이상
- SQLite 3

프론트엔드 의존성을 설치합니다.

```bash
npm install
```

개발 모드로 데스크톱 앱을 실행합니다.

```bash
npm run tauri dev
```

## 원격 접속 확인

앱에 서버를 추가하기 전에 macOS Terminal에서 SSH 접속을 먼저 확인하세요.

```bash
ssh -o BatchMode=yes USER@HOST true
```

비표준 포트나 키 경로를 쓰는 경우 옵션을 함께 지정합니다.

```bash
ssh -o BatchMode=yes -p 2222 -i /path/to/key USER@HOST true
```

원격 기본 GPU 쿼리도 확인할 수 있습니다.

```bash
ssh -o BatchMode=yes USER@HOST 'nvidia-smi --query-gpu=index,name,uuid,driver_version,memory.total,memory.used,utilization.gpu,temperature.gpu,power.draw,power.limit --format=csv,noheader,nounits'
```

프로세스 쿼리와 보강 정보는 다음 명령으로 확인합니다.

```bash
ssh -o BatchMode=yes USER@HOST 'nvidia-smi --query-compute-apps=gpu_uuid,pid,process_name,used_memory --format=csv,noheader,nounits; ps -eo pid=,user=,comm=,args='
```

선택 샘플링 명령은 시스템에 따라 실패할 수 있습니다.

```bash
ssh -o BatchMode=yes USER@HOST 'nvidia-smi pmon -c 1; nvidia-smi dmon -c 1'
```

`pmon` 또는 `dmon` 실패가 곧 서버 사용 불가를 뜻하진 않습니다. 기본 GPU 스냅샷을 수집할 수 있으면 앱은 가능한 데이터를 표시하고 지원되지 않는 선택 섹션을 경고로 남깁니다.

## 로컬 검증 명령

README 변경에는 빌드가 필요하지 않지만, 개발 중 코드 변경이 있었다면 다음 명령으로 회귀를 확인합니다.

```bash
cargo test --manifest-path src-tauri/Cargo.toml
npm run test
npm run build
```

## v0.1 제한 사항

v0.1은 키 기반 SSH로 Linux NVIDIA GPU 서버의 최신 상태를 확인하는 데 초점을 둡니다. 다음 항목은 현재 범위에 포함되지 않습니다.

- 비밀번호 인증
- 자격 증명 저장
- 장기 히스토리 저장
- 차트
- 알림
- 웹 대시보드
- 앱 패키징과 서명

프로세스 정보는 표시 목적의 근사치입니다. GPUWatcher는 nvitop을 실행하지 않으며, NVML과 psutil 조합과 완전히 같은 결과를 보장하지 않습니다. 짧게 실행되는 프로세스는 샘플 사이에 사라질 수 있고, 프로세스 이름은 `nvidia-smi` 또는 `ps` 중 한쪽에서 올 수 있습니다.

## 관련 문서

- [Protocol v1 contract](docs/protocol/gpuwatcher-json-v1.md)
- [Server setup](docs/setup/server-setup.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Smoke checklist](docs/smoke-checklist.md)
