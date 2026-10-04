# To-do

PC와 폰에서 함께 쓰는 아주 단순한 할 일 목록 (설치 없는 웹앱 / PWA).

- 할 일마다 **하위 단계(실행 순서)** 를 둘 수 있음
- `⋮⋮` 손잡이를 끌어서 할 일·단계 순서 변경 (폰은 살짝 길게 누른 뒤 끌기). 단계를 다른 할 일로 옮길 수도 있음
- 단계마다 예상 시간 입력 → 할 일 옆에 **합계** 표시
  - 입력 예: `30` (분), `45m`, `1.5h`, `1h30m`, `1:30`, `2시간`, `30분`
- 제목·시간은 눌러서 바로 수정, 빈 칸이면 기존 값 유지
- 오프라인에서도 동작하고, 연결되면 동기화

## 배포 (한 번만)

정적 파일뿐이라 아무 정적 호스팅에 올리면 됩니다.

**GitHub Pages**: 저장소 Settings → Pages → Source: *Deploy from a branch* → 브랜치 선택, `/ (root)` → Save.
몇 분 뒤 `https://<계정>.github.io/<저장소>/` 에서 열립니다.
(비공개 저장소의 Pages는 유료 플랜이 필요합니다. 무료로 하려면 저장소를 공개하거나 Netlify / Cloudflare Pages 에 폴더를 올리세요. 할 일 데이터는 저장소가 아니라 비공개 Gist에 저장되므로 코드가 공개돼도 데이터는 공개되지 않습니다.)

폰에서는 그 주소를 열고 **홈 화면에 추가** 하면 앱처럼 쓸 수 있습니다.

## PC·폰 동기화

데이터는 본인 GitHub 계정의 **비공개 Gist** 에 저장됩니다.

1. [gist 권한 토큰 만들기](https://github.com/settings/tokens/new?scopes=gist&description=To-do%20sync) (권한은 `gist` 하나만)
2. 앱 오른쪽 위 ⚙ → 토큰 붙여넣기 → 저장
3. 다른 기기에서도 같은 토큰을 넣으면 같은 목록이 보임

- 수정하면 1초 뒤 자동 저장, 앱으로 돌아올 때 / 1분마다 최신 내용 가져옴
- 두 기기에서 *동시에* 고치면 나중에 저장한 쪽이 이깁니다
- 토큰은 그 기기 브라우저에만 저장됩니다
- ⚙ 메뉴의 내보내기/가져오기로 JSON 백업 가능

## 파일

| 파일 | 역할 |
|---|---|
| `index.html` | 화면 |
| `style.css` | 스타일 (라이트/다크 자동) |
| `app.js` | 목록·시간 계산·Gist 동기화 |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | 오프라인·홈 화면 앱 |
| `vendor/Sortable.min.js` | 드래그 정렬 ([SortableJS](https://github.com/SortableJS/Sortable), MIT) |

로컬 실행: `python3 -m http.server` 후 http://localhost:8000
