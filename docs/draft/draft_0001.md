# GPUWatcher 구현 기획서

## 1. 프로젝트 개요

GPUWatcher는 여러 연구실 GPU 서버의 GPU 상태를 macOS 앱 하나에서 한눈에 확인할 수 있게 하는 데스크톱 애플리케이션이다.

기존에는 사용자가 각 연구실 서버에 직접 SSH로 접속한 뒤 `nvidia-smi`, `nvitop` 같은 명령어를 실행해서 GPU 메모리 사용량, 온도, GPU utilization, 실행 중인 프로세스 등을 확인해야 했다.

GPUWatcher는 이 과정을 자동화하여, 등록된 여러 서버의 GPU 상태를 주기적으로 수집하고 하나의 대시보드에서 보여준다.

## 2. 프로젝트 목표

### 2.1 핵심 목표

여러 원격 GPU 서버의 상태를 macOS 앱에서 실시간에 가깝게 확인할 수 있게 한다.

### 2.2 해결하려는 문제

현재 연구실 GPU 서버 사용자는 다음과 같은 불편함을 겪는다.

* 서버마다 직접 SSH 접속해야 한다.
* 각 서버에서 `nvidia-smi` 또는 `nvitop`을 직접 실행해야 한다.
* 어떤 서버에 GPU가 비어 있는지 빠르게 알기 어렵다.
* 누가 어떤 GPU를 점유하고 있는지 서버별로 따로 확인해야 한다.
* GPU 메모리 사용량, 온도, 프로세스 정보를 한 화면에서 비교하기 어렵다.
* 서버가 많아질수록 확인 비용이 커진다.

### 2.3 기대 효과

GPUWatcher를 사용하면 다음을 빠르게 확인할 수 있다.

* 어떤 서버가 online/offline 상태인지
* 서버별 GPU 개수
* 서버별 사용 가능한 GPU 개수
* GPU별 메모리 사용량
* GPU별 utilization
* GPU별 온도
* GPU별 실행 중인 주요 프로세스
* 프로세스별 사용자, PID, command, GPU memory 사용량

## 3. 대상 사용자

### 3.1 주요 사용자

* AI 연구실 소속 학생
* 딥러닝 실험을 수행하는 연구자
* 여러 GPU 서버를 함께 사용하는 팀원
* 서버에 직접 SSH 접속해서 GPU 상태를 확인하는 사용자

### 3.2 초기 사용 환경

* 사용자는 macOS 기기를 사용한다.
* 원격 서버는 Linux 기반 NVIDIA GPU 서버이다.
* 사용자는 각 서버에 SSH key 기반으로 접속할 수 있다.
* 서버에는 NVIDIA Driver가 설치되어 있다.
* 서버에는 Python 환경을 사용할 수 있다.

## 4. 핵심 사용자 시나리오

### 4.1 전체 GPU 상태 확인

사용자는 GPUWatcher 앱을 실행한다.

앱은 등록된 여러 서버에 SSH로 접속해 GPU 상태를 수집한다.

사용자는 메인 대시보드에서 다음 정보를 확인한다.

* 서버 이름
* 서버 접속 상태
* GPU 총 개수
* 사용 중인 GPU 개수
* 비어 있는 GPU 개수
* 평균 GPU utilization
* 평균 GPU memory usage
* 최고 온도
* 마지막 업데이트 시간

### 4.2 특정 서버 상세 확인

사용자는 특정 서버를 클릭한다.

앱은 해당 서버의 GPU 목록을 보여준다.

각 GPU 카드에는 다음 정보가 표시된다.

* GPU index
* GPU name
* GPU UUID
* GPU utilization
* memory total
* memory used
* memory free
* temperature
* power draw
* fan speed
* 실행 중인 프로세스 목록

### 4.3 전체 프로세스 확인

사용자는 전체 서버에서 실행 중인 GPU 프로세스를 하나의 테이블로 확인한다.

프로세스 테이블에는 다음 정보가 표시된다.

* 서버 이름
* GPU index
* 사용자명
* PID
* command
* GPU memory usage
* GPU utilization
* CPU usage
* host memory usage

사용자는 GPU memory usage 기준으로 정렬할 수 있다.

### 4.4 서버 Offline 확인

앱이 특정 서버에 SSH 접속하지 못하면 해당 서버를 offline 상태로 표시한다.

사용자는 다음 정보를 확인할 수 있다.

* offline 상태
* 마지막으로 정상 수집된 시간
* 에러 메시지
* SSH timeout 여부
* 인증 실패 여부
* collector 미설치 여부

## 5. MVP 범위

### 5.1 MVP에서 반드시 구현할 기능

#### 서버 관리

* 서버 추가
* 서버 수정
* 서버 삭제
* 서버 목록 저장
* 서버 enable/disable 설정
* SSH 접속 테스트

#### GPU 상태 수집

* SSH를 통해 원격 서버에 접속
* 원격 서버에서 `gpuwatcher --json` 실행
* stdout으로 반환된 JSON 파싱
* 서버별 GPU 상태 수집
* 주기적 polling 지원

#### GPU 정보 표시

* 서버별 GPU 목록 표시
* GPU index 표시
* GPU name 표시
* GPU UUID 표시
* GPU utilization 표시
* GPU memory total 표시
* GPU memory used 표시
* GPU memory free 표시
* GPU temperature 표시
* power draw 표시
* fan speed 표시

#### 프로세스 정보 표시

* GPU별 프로세스 목록 표시
* PID 표시
* username 표시
* command 표시
* GPU memory usage 표시
* GPU utilization 표시
* CPU usage 표시
* host memory usage 표시

#### 에러 상태 표시

* SSH timeout
* authentication failed
* server unreachable
* `gpuwatcher` missing
* `nvitop` missing
* NVML unavailable
* malformed JSON
* unknown error

### 5.2 MVP에서 제외할 기능

다음 기능은 v0.1 MVP에서 구현하지 않는다.

* 사용자 로그인
* 중앙 서버
* 클라우드 동기화
* 팀 계정
* 권한 관리
* 장기 히스토리 저장
* GPU 사용량 차트
* 알림 기능
* Slurm 연동
* Docker container 상세 정보
* Prometheus exporter
* Grafana dashboard
* 웹 대시보드
* 모바일 앱
* 비밀번호 기반 SSH 인증 저장

## 6. 플랫폼 결정

### 6.1 초기 플랫폼

GPUWatcher의 초기 플랫폼은 macOS Desktop App이다.

### 6.2 플랫폼 범위

v0.1에서는 macOS만 지원한다.

### 6.3 앱 형태

초기 앱은 일반 macOS Desktop Window 형태로 구현한다.

Menu Bar App 형태는 v0.2 이후에 고려한다.

## 7. 원격 서버 접근 방식

### 7.1 기본 접근 방식

GPUWatcher는 SSH를 통해 원격 GPU 서버에 접속한다.

각 서버에는 다음 정보가 필요하다.

* server name
* host
* port
* username
* SSH key path
* polling interval
* enabled 여부

### 7.2 인증 방식

MVP에서는 SSH key 기반 인증만 지원한다.

비밀번호 기반 인증은 MVP에서 제외한다.

### 7.3 원격 명령 실행

앱은 각 서버에 대해 다음 명령을 실행한다.

```bash
gpuwatcher --json
```

원격 명령은 JSON 객체 하나를 stdout으로 출력해야 한다.

앱은 stdout을 파싱하여 서버 상태를 업데이트한다.

## 8. 서버 측 Collector

### 8.1 Collector 이름

서버 측 collector 패키지 이름은 `gpuwatcher`로 한다.

### 8.2 Collector 역할

`gpuwatcher`는 원격 GPU 서버에서 실행되어 현재 GPU 상태를 JSON으로 출력한다.

### 8.3 Collector 구현 방식

`gpuwatcher`는 Python으로 구현한다.

GPU 정보 수집은 NVIDIA Management Library(NVML)를 기반으로 구현한다.

구현 시 `nvitop`의 GPU 상태 수집 방식과 데이터 모델을 참고할 수 있으나, `nvitop` 라이브러리에 직접 의존하는 것은 필수 요구사항이 아니다.

Collector는 다음 라이브러리를 활용할 수 있다.

* `nvidia-ml-py` (NVML Python Binding)
* `psutil`
* `subprocess`
* `nvidia-smi` (보조 수단)

### 8.4 Collector 실행 방식

```bash
gpuwatcher --json
```

### 8.5 Collector 출력 원칙

* stdout에는 JSON만 출력한다.
* 로그나 경고는 stderr로 출력한다.
* 정상 상태와 에러 상태 모두 JSON으로 반환한다.
* JSON schema는 앱과 collector 사이의 계약(contract)으로 간주한다.

## 9. 데이터 전달 방식

### 9.1 기본 방식

데이터는 JSON over SSH stdout 방식으로 전달한다.

즉, macOS 앱이 SSH로 원격 명령을 실행하고, 원격 명령의 stdout을 JSON으로 파싱한다.

### 9.2 정상 응답 예시

```json
{
  "ok": true,
  "timestamp": "2026-06-01T15:24:00+09:00",
  "server": {
    "hostname": "lab-server-01",
    "driverVersion": "550.54.15",
    "cudaVersion": "12.4"
  },
  "gpus": [
    {
      "index": 0,
      "uuid": "GPU-xxxx",
      "name": "NVIDIA RTX 4090",
      "temperatureCelsius": 61,
      "gpuUtilizationPercent": 92,
      "memoryTotalMiB": 24564,
      "memoryUsedMiB": 21120,
      "memoryFreeMiB": 3444,
      "powerDrawWatt": 310,
      "powerLimitWatt": 450,
      "fanSpeedPercent": 72,
      "processes": [
        {
          "pid": 12345,
          "username": "alice",
          "command": "python train.py --config configs/llama.yaml",
          "gpuMemoryMiB": 18432,
          "gpuUtilizationPercent": 89,
          "cpuPercent": 240.5,
          "hostMemoryMiB": 16384,
          "startedAt": "2026-06-01T13:02:11+09:00"
        }
      ]
    }
  ]
}
```

### 9.3 에러 응답 예시

```json
{
  "ok": false,
  "timestamp": "2026-06-01T15:24:00+09:00",
  "error": {
    "type": "nvml_unavailable",
    "message": "NVML is not available"
  }
}
```

## 10. 초기 화면 구성

### 10.1 Overview 화면

앱의 첫 화면이다.

등록된 모든 서버의 요약 상태를 보여준다.

표시 정보:

* server name
* online/offline status
* GPU count
* busy GPU count
* free GPU count
* average GPU utilization
* average memory usage
* max temperature
* last updated time

### 10.2 Server Detail 화면

특정 서버의 GPU 상세 상태를 보여준다.

표시 정보:

* server name
* hostname
* driver version
* CUDA version
* last updated time
* GPU card list
* GPU별 process list

### 10.3 Process 화면

전체 서버의 GPU 프로세스를 테이블로 보여준다.

표시 정보:

* server name
* GPU index
* username
* PID
* command
* GPU memory usage
* GPU utilization
* CPU usage
* host memory usage

기본 정렬 기준은 GPU memory usage descending으로 한다.

### 10.4 Settings 화면

서버 등록 및 설정을 관리한다.

기능:

* add server
* edit server
* delete server
* enable/disable server
* test SSH connection
* polling interval 설정

## 11. 로컬 저장 데이터

GPUWatcher는 로컬에 다음 정보를 저장한다.

### 11.1 서버 설정

* id
* name
* host
* port
* username
* ssh key path
* polling interval
* enabled
* created at
* updated at

### 11.2 최신 GPU 상태

* server id
* timestamp
* raw JSON snapshot
* parsed GPU summary
* last success time
* last error

### 11.3 저장 방식

MVP에서는 SQLite를 사용한다.

장기 히스토리 저장은 MVP에서 제외한다.

## 12. 기술 스택

### 12.1 확정 기술 스택

MVP에서는 다음 스택을 사용한다.

#### Desktop Application

* Framework: Tauri
* Frontend: React
* Language: TypeScript
* Styling: Tailwind CSS
* State Management: Zustand
* Data Fetching: TanStack Query

#### Backend

* Language: Rust
* Tauri Commands
* SSH Command Execution
* Polling Scheduler

#### Local Storage

* SQLite

#### Server Collector

* Language: Python
* Package Name: `gpuwatcher`
* CLI Command: `gpuwatcher --json`
* GPU Metrics: NVML 기반 수집
* Process Metrics: psutil 기반 수집
* Output Format: JSON

### 12.2 기술 스택 선정 이유

* React 기반으로 빠르게 대시보드 UI를 구현할 수 있다.
* TypeScript를 통해 데이터 모델을 명확하게 정의할 수 있다.
* Tauri는 Electron 대비 가볍고 배포 크기가 작다.
* Rust를 통해 안정적인 백엔드 로직을 구현할 수 있다.
* SQLite를 통해 별도 서버 없이 로컬 상태를 저장할 수 있다.
* 향후 Windows 및 Linux 지원으로 확장하기 쉽다.

## 13. 비기능 요구사항

### 13.1 보안

* 비밀번호를 평문 저장하지 않는다.
* MVP에서는 SSH key path만 저장한다.
* SSH key 자체를 앱 DB에 복사하지 않는다.
* 추후 민감 정보는 macOS Keychain 사용을 고려한다.

### 13.2 안정성

* 특정 서버 수집 실패가 전체 앱 실패로 이어지면 안 된다.
* 서버별 polling은 독립적으로 처리한다.
* JSON 파싱 실패 시 사용자에게 명확한 에러를 보여준다.
* 일부 GPU process 정보가 누락되어도 전체 수집을 실패 처리하지 않는다.

### 13.3 성능

* 기본 polling interval은 5초 또는 10초로 설정한다.
* 여러 서버를 동시에 polling할 수 있어야 한다.
* UI는 마지막 성공 snapshot을 유지해야 한다.
* offline 서버가 있어도 앱 전체가 느려지면 안 된다.

## 14. 성공 기준

MVP가 성공했다고 판단하는 기준은 다음과 같다.

* 사용자가 앱에서 여러 서버를 등록할 수 있다.
* 앱이 각 서버에 SSH로 접속할 수 있다.
* 앱이 원격 `gpuwatcher --json` 명령을 실행할 수 있다.
* 앱이 GPU 상태 JSON을 파싱할 수 있다.
* 앱이 여러 서버의 GPU 상태를 한 화면에서 보여줄 수 있다.
* 사용자가 어떤 서버에 여유 GPU가 있는지 빠르게 알 수 있다.
* 사용자가 누가 어떤 GPU를 사용 중인지 확인할 수 있다.
* 서버 접속 실패나 collector 오류를 명확하게 볼 수 있다.

## 15. v0.1 개발 우선순위

### Phase 1: 문서와 프로토콜 확정

* 구현 기획서 작성
* JSON Protocol 문서 작성
* 데이터 타입 정의
* Mock JSON 작성

### Phase 2: Server Collector 구현

* `gpuwatcher` Python 패키지 생성
* `gpuwatcher --json` 명령 구현
* NVML 기반 GPU 정보 수집
* Process 정보 수집
* 에러 JSON 반환 구현
* Mock Mode 구현

### Phase 3: Desktop App 기본 구조 구현

* Tauri App 생성
* React UI 구성
* SQLite Schema 구성
* 서버 CRUD 구현
* Mock Data 기반 Overview 화면 구현

### Phase 4: SSH 연동

* 서버별 SSH Command 실행
* Timeout 처리
* stdout JSON 파싱
* stderr/error 처리
* 서버별 online/offline 상태 업데이트

### Phase 5: UI 완성

* Overview 화면
* Server Detail 화면
* Process Table 화면
* Settings 화면
* Error State 표시
* Loading State 표시

### Phase 6: 정리

* README 작성
* Server Setup 문서 작성
* Protocol 문서 작성
* Demo Screenshot 추가
* Basic Test 추가

## 16. 추후 확장 후보

다음 기능은 MVP 이후 고려한다.

* macOS Menu Bar App
* Free GPU Notification
* Temperature Warning Notification
* GPU 사용 히스토리 차트
* 사용자별 GPU 사용량 통계
* Slurm Job ID 연동
* Docker Container 정보 표시
* Prometheus Exporter
* Grafana Dashboard
* Web Dashboard
* Team Shared Server Config
* Server Group/Tag 기능
* SSH Config Import
* Encrypted Credential Storage
