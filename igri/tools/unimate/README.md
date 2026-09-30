# UniMate 브리지

[UniMate](https://github.com/Friedrich-M/UniMate)는 메시를 만드는 도구가 아니라, **리깅된 임의의 골격**에 텍스트 프롬프트로 **동작(모션)**을 생성하는 모델입니다. 그래서 이그리는 사람·동물을 다음과 같이 다시 만들었습니다.

1. `js/models/rigs.js` — 주민·소방관·토끼·다람쥐·사슴·새를 **스킨드 메시 + 골격**으로 재모델링했습니다. 관절 이름은 UniMate 학습 데이터(Mixamo·Truebones)의 규칙을 따르고(`Hips`, `LeftUpLeg`, `L_Thigh`, `Tail`, `L_Wing` …), 휴식 자세는 회전 없이 오프셋만으로 정의했습니다(사람은 T-포즈, 모두 +Z를 바라봄). UniMate는 관절 회전을 자식 관절에 저장하므로 머리·귀·꼬리·날개 끝에 `End` 관절을 두었습니다.
2. `js/models/clips/procedural.js` — 손으로 키잉한 기본 동작(걷기·달리기·패닉·조준, 깡충·질주, 풀 뜯기, 날갯짓 …). UniMate 결과가 없을 때 재생됩니다.
3. `js/models/clips/unimate.js` — UniMate가 생성한 동작. 같은 이름의 클립이 있으면 기본 동작을 **덮어씁니다**. `rigs.html`에서 ✦ 표시와 프롬프트로 확인할 수 있습니다.

이 폴더의 도구가 두 세계를 잇습니다.

| 파일 | 역할 |
|---|---|
| `export_rigs.mjs` | 게임 리그(관절·부모·오프셋·정면 기준 골반)와 기본 동작을 `work/rigs.json`으로 내보냄 |
| `igri_unimate.py prepare` | `rigs.json` → UniMate 1단계 NPZ → UniMate의 4단계 추출 코드(`process_object`)로 `cond.npy`와 정규화 클립 생성 |
| `igri_unimate.py roundtrip` | 기본 동작을 UniMate 12차원 특징으로 인코딩한 뒤 다시 게임 리그로 디코딩해 오차 확인(모델 불필요) |
| `igri_unimate.py exp` | 공개 체크포인트를 쓰되 우리 feature 폴더만 읽는 실험 폴더 생성 (UniML3D 데이터셋 불필요) |
| `igri_unimate.py to_clips` | UniMate 샘플(`motions/*.npy`) → 제자리 루프 클립 → `js/models/clips/unimate.js` |
| `sample_cpu.py` | UniMate 샘플러를 고정 스텝 ODE 해법으로 실행 (CPU에서 약 8배 빠름) |
| `prompts.json` | 동작별 프롬프트. UniMate `--test_cases_json` 형식 그대로 |

검증 결과: 5개 골격, 14개 클립 모두 왕복 오차 **0.000 mm / 0.00°**(UniMate 정규화에서 스케일만 달라지고 정면 회전은 0°).

## 실행 순서

GPU가 있으면 빠르지만 CPU로도 됩니다. UniMate 쪽 설치는 그 저장소 README를 따르세요(Python 3.11, `Motion` 라이브러리, torch 등). 아래에서 `$UM`은 UniMate 클론 경로입니다.

```bash
# 0) 게임 리그 내보내기 (igri 폴더에서)
npm i --no-save three@0.170.0
node tools/unimate/export_rigs.mjs

# 1) UniMate 형식으로 변환 + 왕복 검증
python tools/unimate/igri_unimate.py prepare   --unimate $UM
python tools/unimate/igri_unimate.py roundtrip --unimate $UM     # worst FK error 0.000 mm 이면 정상

# 2) 체크포인트 받기 (Hugging Face, 약 1.2 GB) + 실험 폴더 만들기
#    사람은 mixamo, 동물은 truebones 정규화 통계를 쓰도록 feature 폴더가 나뉘어 있습니다.
huggingface-cli download Linzhan/UniMate --include "unimate_uniml3d_f60_preview/config.json" \
    "unimate_uniml3d_f60_preview/dataset_stats.npy" \
    "unimate_uniml3d_f60_preview/checkpoints/checkpoint_step_120000.pt" --local-dir $UM/outputs/released
python tools/unimate/igri_unimate.py exp \
    --checkpoint $UM/outputs/released/unimate_uniml3d_f60_preview --out $UM/outputs/igri_f60   # GPU면 --device cuda

# 3) 동작 생성
#    GPU가 없으면 sample_cpu.py로 고정 스텝 해법(midpoint 16스텝)을 쓰세요.
#    기본 해법(dopri5)은 CPU에서 동작당 약 10분, 이 방법은 약 75초이고 결과 품질도 비슷하거나 낫습니다.
python tools/unimate/sample_cpu.py --unimate $UM --method midpoint --steps 16 -- \
    --exp_dir outputs/igri_f60 \
    --test_cases_json $PWD/tools/unimate/prompts.json \
    --num_repetitions 3 --batch_size 16 --only_save_motion \
    --output_dir outputs/igri
#    GPU가 있으면 원래 명령 그대로: cd $UM && python -m unimate.inference.sample --exp_dir outputs/igri_f60 ...

# 4) 게임 클립으로 변환 (마음에 드는 반복 번호는 --pick으로)
cd /path/to/igri
python tools/unimate/igri_unimate.py to_clips --unimate $UM \
    --motions $UM/outputs/igri/motions --pick IgriRabbit-hop=2 IgriDeer-gallop=1
```

`rigs.html`을 열어 ✦ 클립을 확인하고, 게임을 다시 빌드하면 적용됩니다. 결과가 이상한 동작만 `unimate.js`에서 빼면 그 동작은 기본 동작으로 돌아갑니다.

## 현재 `unimate.js` (공개 체크포인트 `unimate_uniml3d_f60_preview` step 120000)

CPU에서 `sample_cpu.py`(midpoint 16스텝)로 생성했습니다. 기본 프롬프트 16개 × 3벌, 실패한 동작은 `prompts_retry.json`·`prompts_retry2.json`의 다른 표현으로 2벌씩 더 뽑고, `--auto` 점수와 눈 검토로 골랐습니다.

| 캐릭터 | UniMate 동작 | 기본 동작 유지 |
|---|---|---|
| 주민·소방관 | 대기, 걷기, 달리기, 패닉, 조준(상체만) | — |
| 토끼 | 대기, 깡충, 질주 | — |
| 다람쥐 | 대기, 깡충 | 질주 (생성 속도가 게임 이동 속도의 1/4 수준) |
| 사슴 | 대기, 걷기, 질주 | — |
| 새 | 대기(날개 접고 쪼기), 날기 | — |

알게 된 점: 빠른 이동은 짧고 단순한 문장("a deer runs forward fast")이 훨씬 잘 나옵니다. 조준은 걸으면서 팔을 뻗은 벌만 나와서, 팔을 뻗은 0~41프레임의 상체만 쓰고 다리는 선 자세로 둡니다.

재현 명령(샘플 폴더 3개를 합쳐 선별):

```bash
python tools/unimate/igri_unimate.py to_clips --auto --unimate $UM \
    --motions $UM/outputs/igri_f60/all/motions $UM/outputs/igri_f60/retry/motions $UM/outputs/igri_f60/retry2/motions \
    --pick IgriDeer-idle=2 IgriHuman-aim=b1 --range IgriHuman-aim=0-41 \
    --only "IgriHuman-aim=Spine|Neck|Head|Shoulder|Arm|Hand"
```

선별 옵션: `--auto`(벌마다 점수: 게임 속도 대비 전진 속도, 옆 흐름, 떨림, 루프 이음새), `--pick 키=벌`(직접 지정, 다른 문장 벌은 `b0`, `c1` 식), `--skip 키[=벌]`(검토 후 제외), `--range 키=a-b`(쓸 프레임 구간), `--only 키=정규식`(해당 관절만 쓰는 레이어).

## 변환 규칙 (`to_clips`)

- UniMate 정규화 공간(지름 2로 스케일, +Z 정면, 바닥 접지)을 T-포즈 비교로 구한 스케일·회전으로 게임 리그 공간에 되돌립니다.
- 방향 전환과 이동은 게임이 조종하므로, 루트의 진행 방향 드리프트와 수평 이동을 제거하고 평균 속도만 `speed`로 남깁니다. 게임은 에이전트의 실제 속도와 이 값의 비율로 재생 속도를 맞춥니다.
- 가장 비슷한 두 프레임 사이를 잘라 루프를 만들고(이동 동작 0.35초 이상, 대기 동작 1.2초 이상), 끝의 몇 프레임을 시작 직전 프레임으로 크로스페이드합니다.
- 움직이지 않는 관절 트랙은 저장하지 않습니다.

## 참고

- 사람 골격은 소방관과 공유합니다. `IgriHuman-aim` 같은 동작은 소방관에게만 쓰입니다.
- 새 동작을 추가하려면 `prompts.json`에 `"<오브젝트 타입>-<클립 이름>": "영어 프롬프트"`를 넣고, 게임 쪽(`enemies.js`의 `animate`)에서 그 클립 이름을 고르게 하면 됩니다.
- `work/`는 중간 산출물 폴더라 저장소에 올리지 않습니다.
