# GPUWatcher v0.3.0 배포 계획

M001의 Astryx 전환과 Liquid Glass 개선을 arm64 macOS 앱으로 배포한다. `jinzer0/GPUWatch` 저장소(ID `1256824919`)의 `devel`을 `main`에 승격한다. 기준 기능 커밋은 `a08e974d643dce682198e01103a9eeaacd346347`이다. [릴리즈 절차](../manual/release_update_protocol.md)

## 후보 소스

- `package.json`, `package-lock.json`, 두 Rust 크레이트의 버전과 잠금 파일을 `0.3.0`으로 맞춘다. 기존 SQLite 스키마·프로토콜·설치 요구사항을 유지한다.
- `main`의 Electron·Vitest·전이 의존성 업데이트를 포함한 `devel`에서 빌드한다. `npm ci`, 렌더러·Electron 빌드, Vitest, Cargo 테스트, 격리 Electron 개발 및 패키지 스모크를 수행한다.
- 패키지 앱 라이트·다크 및 기본·최소 크기에서 창·GPU 지표를 확인한다. 투명도 감소·고대비·동작 감소는 렌더러에서 확인하고 물리 입력과 VoiceOver는 수행 여부를 기록한다.

## 서명과 공증

- 이 문서의 exact 계획 커밋·blob 승인 후 기존 서명 도구와 검증기를 v0.3.0에 결박한다. 승인된 계획 경로·blob·모드·HEAD/인덱스/작업 트리와 정확한 소스를 검증한다. 이전 릴리즈의 도구와 근거는 `v0.2.0`과 해당 원본 소스에서 재현한다.
- 새 run에서 기존 Developer ID Application·Team·키체인 프로필로 서명한다. 기존 앱 JIT 전용 및 helper 빈 entitlement, hardened runtime, timestamp, arm64, strict codesign 검증을 적용한다.
- 앱 공증 ZIP의 exact 매니페스트·아티팩트 SHA-256 승인 뒤 제출한다. Apple Accepted를 받고 staple 및 Gatekeeper를 확인한다. 같은 앱으로 ZIP·DMG를 생성하고 별도 exact DMG 승인 후 제출·Accepted·staple을 확인한다.
- 최초 제출 승인 매니페스트와 소스 결박을 유지한다. 최종 검증기는 Apple 조회와 최종 hash, ZIP·DMG의 앱 동일성, 격리 런타임을 검증한다. 불확실한 제출의 자동 재시도와 서명 대체 경로를 허용하지 않는다. [빌드 및 검증 절차](../../docs/smoke-checklist.md)

## GitHub 승격 및 배포

- 게시 직전에 대상 저장소, `main`과 `devel`의 원격 OID, 서명 검증한 로컬 후보 OID, PR 유무, 제목 `Release: v0.3.0`과 본문 SHA-256을 확인한다. 해당 exact tuple 게시 승인으로 `devel`의 fast-forward push와 non-draft PR 생성을 실행하고 실제 PR 번호와 head/base를 확인한다.
- 병합 전 PR 번호, `OPEN` 상태, 리뷰·검사, head/base OID 및 제목·본문 SHA-256을 승인값과 대조한다. 별도 병합 승인 후 REST 요청 `sha`에 확인한 head OID를 넣는다. `main`의 병합 트리를 검증한 앱 소스와 비교한다.
- 별도 승인된 `v0.3.0` 태그 대상 OID 및 최종 파일명·SHA-256에 따라 arm64 DMG, ZIP, `SHA256SUMS`, `release-validation.json`을 게시한다. 게시 파일을 다시 내려받아 SHA-256과 Gatekeeper를 확인한다. 필요한 `main` → `devel` 동기화는 확인된 별도 범위로 처리한다.
