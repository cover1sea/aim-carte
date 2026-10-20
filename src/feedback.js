// プレイ後フィードバック: 強み・弱点の診断、意識すべき点、練習シナリオの生成
import { getScenario } from './scenarios.js';
import { expertRef } from './reference.js';

export const REFERENCES = {
  fitts: { short: 'Fitts (1954)', full: 'Fitts, P. M. (1954). The information capacity of the human motor system in controlling the amplitude of movement. J. Exp. Psychol., 47(6).', note: '移動時間は「距離÷目標サイズ」の対数 (難易度 ID) に比例する。速さと正確さはトレードオフ。' },
  mackenzie: { short: 'MacKenzie (1992)', full: 'MacKenzie, I. S. (1992). Fitts\' law as a research and design tool in human-computer interaction. HCI, 7(1).', note: 'ポインティング性能をスループット (bits/s) で比較する方法。本アプリの「スループット」はこれに準拠。' },
  meyer: { short: 'Meyer et al. (1988)', full: 'Meyer, D. E., Abrams, R. A., Kornblum, S., Wright, C. E., & Smith, J. E. K. (1988). Optimality in human motor performance: Ideal control of rapid aimed movements. Psychol. Review, 95(3).', note: '最適サブムーブメントモデル。照準は「大きな一次移動 + 小さな修正移動」で構成され、一次移動のばらつきが修正回数を決める。' },
  elliott: { short: 'Elliott et al. (2001, 2010)', full: 'Elliott, D., Helsen, W. F., & Chua, R. (2001). A century later: Woodworth\'s (1899) two-component model of goal-directed aiming. Psychol. Bulletin, 127(3). / Elliott, D. et al. (2010). Goal-directed aiming: two components but multiple processes. Psychol. Bulletin, 136(6).', note: '熟練者は一次移動をわずかに手前 (アンダーシュート) で終える傾向。行き過ぎて戻る修正は、向きの反転が必要で時間とエネルギーのコストが大きい。' },
  roberts: { short: 'Roberts et al. (2016)', full: 'Roberts, J. W., Blinch, J., Elliott, D., et al. (2016). The violation of Fitts\' Law: an examination of displacement biases and corrective submovements. Exp. Brain Res., 234.', note: 'オーバーシュートした試行では反転を伴う二次修正の割合が高くなる。' },
  boudaoud: { short: 'Boudaoud, Spjut & Kim (2022)', full: 'Boudaoud, B., Spjut, J., & Kim, J. (2022). Mouse Sensitivity Effects in First-Person Targeting Tasks. IEEE CoG / arXiv:2203.12050 (NVIDIA Research).', note: 'FPS の照準で、完了時間とスループットが最良になる感度には有意な最適範囲がある。原因は速さと精度のトレードオフで、課題の難しさによって変わる。' },
  gosu: { short: 'Park et al. (2021)', full: 'Park, E., Lee, S., Ham, A., Choi, M., Kim, S., & Lee, B. (2021). Secrets of Gosu: Understanding Physical Combat Skills of Professional Players in First-Person Shooters. CHI \'21.', note: 'プロとアマの差を計測した研究。13 の通説のうち統計的に支持されたのは 6 つだけで、通説を鵜呑みにせず計測で確かめる重要性を示す。' },
  orban: { short: 'Orban de Xivry & Lefèvre (2007)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2277072/',
    full: 'Orban de Xivry, J.-J., & Lefèvre, P. (2007). Saccades and pursuit: two outcomes of a single sensorimotor process. The Journal of Physiology, 584(1), 11–23.',
    note: '目で動く物を追うとき、滑らかな追従は主に速さのずれを、素早い視線のジャンプ (キャッチアップサッカード) は溜まった位置のずれを直す。動きが読める目標では予測で遅れを小さくできるが、急に向きが変わる目標では予測は効かない。目の研究であり、マウス操作への当てはめは本アプリの解釈。' },
  krakauer: { short: 'Krakauer et al. (2000)',
    full: 'Krakauer, J. W., Pine, Z. M., Ghilardi, M. F., & Ghez, C. (2000). Learning of visuomotor transformations for vectorial planning of reaching trajectories. Journal of Neuroscience, 20(23), 8916–8924.',
    note: '画面上の動きの倍率 (ゲイン) が変わったときの適応を調べた研究。倍率への適応は速く、練習しなかった方向にも広く当てはまると報告されている。脳が覚えるのは距離の一覧ではなく、どの距離・方向にも使える倍率という規則だと考えられる。' },
  pearson: { short: 'Pearson et al. (2010)', url: 'https://profiles.wustl.edu/en/publications/learning-not-to-generalize-modular-adaptation-of-visuomotor-gain/',
    full: 'Pearson, T. S., Krakauer, J. W., & Mazzoni, P. (2010). Learning not to generalize: modular adaptation of visuomotor gain. Journal of Neurophysiology, 103(6), 2938–2952.',
    note: '方向ごとに違う 2 つの倍率は同時に学習できたが、1 つだけのときより遅かった。感度を頻繁に変えると、その都度の慣らしに時間がかかることと整合する。' },
  braun: { short: 'Braun et al. (2009)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2669412/',
    full: 'Braun, D. A., Aertsen, A., Wolpert, D. M., & Mehring, C. (2009). Motor task variation induces structural learning. Current Biology, 19(4), 352–357.',
    note: '毎回ランダムに変わる課題 (向きの変換) で練習すると、同じ構造の新しい課題への適応が速くなり、切り替え時の混乱も減った。FPS の感度 (倍率) で直接確かめた研究ではない。' },
  sensorTilt: { short: 'センサーエイムの解説 (ヤタネコ氏・gosio 氏)', url: 'https://note.com/yataneko33/n/n991e7deb2d0c',
    full: 'ヤタネコ「AIM研究雑記#8 誰でも分かるマウスセンサーの動き方」(note) / gosio 氏の X の投稿 (https://x.com/fps_user01/status/1678648868131545090)。いずれも個人の経験にもとづく解説。',
    note: 'マウスを水平に動かしても、センサーの向きが傾いていると照準は斜めに動く。パッド上の軌道が弧や斜めでも、センサーが横に動けば照準は水平に動く。' },
  valMove: { short: 'VALORANT の移動精度 (選手の検証)', url: 'https://www.sportskeeda.com/valorant/should-valorant-remove-delay-player-accurate-strafing',
    full: 'Sportskeeda「Should Valorant remove the delay before a player is accurate during strafing?」ほか。Cloud9 の Relyks 選手の検証と、コミュニティの議論。',
    note: 'VALORANT では最高速度の約 30% 以下なら精度が保たれるという選手の検証がある。カウンターストレイフ (逆方向のキーで止まる) で正確になるまでの時間は縮むが、差は小さく、効果自体にも議論がある。本アプリの「30% を超えると弾がぶれる」はこれを単純化したもの。' },
  owRelative: { short: '相対的な動き (OW フォーラム)', url: 'https://us.forums.blizzard.com/en/overwatch/t/help-with-aim-on-hitscan/659361',
    full: 'Blizzard Overwatch フォーラムの議論 (ユーザーの意見)。',
    note: '自分と相手が同じ向きに横移動していれば、相手は照準に対してほとんど動かない。照準から見た「相対的な動き」で追う、という考え方。' },
  soechting: { short: 'Soechting et al. (2005)', url: 'https://experts.umn.edu/en/publications/smooth-pursuit-tracking-of-an-abrupt-change-in-target-direction-v/',
    full: 'Soechting, J. F., Mrotek, L. A., & Flanders, M. (2005). Smooth pursuit tracking of an abrupt change in target direction: Vector superposition of discrete responses. Experimental Brain Research, 160(2), 245–258.',
    note: '目で追っている目標が急に向きを変えると、目の追従は約 90ms で減速を始め、約 130ms で新しい向きへ変わる。反応は「元の動きを止める」と「新しい動きを始める」の 2 つの重ね合わせで説明できる。' },
  yang2025: { short: 'Yang et al. (2025)', url: 'https://www.psypost.org/experienced-fps-gamers-show-faster-more-efficient-eye-movements-during-aiming-tasks-study-finds/',
    full: 'Yang et al. (2025). The aiming advantages in experienced first-person shooter gamers: Evidence from eye movement patterns. Computers in Human Behavior. (リンクは解説記事)',
    note: '経験のある FPS プレイヤーは、少ない視線移動と修正で目標を捉え、特に不確実な条件で速かった。正確さには差がなかった。画面中心から遠い目標ほど捉えるのが遅れた。照準の動きは最後の視線移動 (サッカード) の経路に沿っていた。' },
  appelbaum: { short: 'Appelbaum & Erickson (2018)', url: 'https://dukespace.lib.duke.edu/items/00674222-b2d2-445e-b42a-babdf184939c',
    full: 'Appelbaum, L. G., & Erickson, G. (2018). Sports vision training: A review of the state-of-the-art in digital training techniques. International Review of Sport and Exercise Psychology, 11(1), 160–189.',
    note: 'デジタルの視覚トレーニング (動体視力などの訓練) の総説。視覚機能そのものは伸びうるが、競技成績への転移の証拠は研究によってまちまちで、まだ確立していない。' },
  boudaoud2: { short: 'Boudaoud et al. (2022) 計測値', url: 'https://arxiv.org/abs/2203.12050',
    full: 'Boudaoud, B., Spjut, J., & Kim, J. (2022). Mouse Sensitivity Effects in First-Person Targeting Tasks. arXiv:2203.12050.',
    note: '週 10〜20 時間以上プレイする経験のある FPS プレイヤー 13 人が、7〜25° 離れた目標 (難易度 0.83〜5.50 bits) を撃つ課題で、1 体あたりの所要時間はおおむね 0.4〜0.8 秒だった。本アプリの上級者の目安の基準に使用。' },
  spjut: { short: 'Spjut et al. (2019)', url: 'https://research.nvidia.com/labs/amri/publication/spjut2019latency',
    full: 'Spjut, J., Boudaoud, B., Binaee, K., Kim, J., Majercik, A., McGuire, M., Luebke, D., & Kim, J. (2019). Latency of 30 ms benefits first person targeting tasks more than refresh rate above 60 Hz. SIGGRAPH Asia 2019 Technical Briefs.',
    note: 'FPS の照準課題では、60Hz を超えるリフレッシュレートそのものより、入力から表示までの遅延の短さの方が成績に効いた。' },
  rt: { short: 'Woods et al. (2015)', full: 'Woods, D. L., et al. (2015). Factors influencing the latency of simple reaction time. Front. Hum. Neurosci., 9:131.', note: '視覚刺激への単純反応時間は若年成人でおおむね 200〜250ms。予測 (フライング) を除けば短縮幅には限界がある。' },
  practice: { short: 'Ericsson et al. (1993) / Shea & Morgan (1979)', full: 'Ericsson, K. A., Krampe, R. T., & Tesch-Römer, C. (1993). The role of deliberate practice. Psychol. Review, 100(3). / Shea, J. B., & Morgan, R. L. (1979). Contextual interference effects on the acquisition, retention, and transfer of a motor skill. J. Exp. Psychol.: HLM, 5(2).', note: '明確な目標とフィードバックを伴う「意図的練習」が上達を生む。単一課題の反復は短期成績を、課題を混ぜる練習は定着と転移を高める。' },
  wulf: { short: 'Wulf (2013)', full: 'Wulf, G. (2013). Attentional focus and motor learning: a review of 15 years. International Review of Sport and Exercise Psychology, 6(1).', note: '体の動き (内的焦点) より、動きの結果や対象 (外的焦点) に注意を向けた方が、運動の学習と成績が良くなる。メニューの「意識すること」はこの書き方に揃えている。' },
  schmidtbjork: { short: 'Schmidt & Bjork (1992)', full: 'Schmidt, R. A., & Bjork, R. A. (1992). New conceptualizations of practice: Common principles in three paradigms suggest new concepts for training. Psychological Science, 3(4).', note: '練習中の成績と、後に残る上達 (保持・転移) は別もの。練習中に少し難しく感じる条件の方が、上達が残りやすい。' },
  leegenovese: { short: 'Lee & Genovese (1988)', full: 'Lee, T. D., & Genovese, E. D. (1988). Distribution of practice in motor skill acquisition: Learning and performance effects reconsidered. Research Quarterly for Exercise and Sport, 59(4).', note: '休憩を挟む分散練習は、連続した集中練習より学習効果が高い傾向がある。' },
  voltaic: { short: 'Voltaic ルーティン', url: 'https://docs.google.com/document/d/1BPiDxbaqQVxInKwFfdr_AJdJDYVGKbUBGHJDKOeUy-Q/mobilebasic',
    full: 'Voltaic「Fundamental aim training routines」(ルーティン作成: sini)。競技エイムコミュニティ Voltaic の公式練習ルーティン。',
    note: 'エイムをクリック・トラッキング・スイッチに分け、ランク順に段階的に練習する。トラッキングは「できるだけ滑らかに」「横と縦の両方の角度で」、反応が必要なシナリオでは「予測せず、できるだけ反応で追う」、スイッチは「できるだけ速く切り替える」と指示。難しすぎるルーティンに固執せず、同じシナリオばかりでパターンを覚えないよう似たシナリオを交互に行うことも勧めている。' },
  aimlabsSmooth: { short: 'Aim Labs: 滑らかさ', url: 'https://aimlabs.com/articles/?p=4339',
    full: 'Mr Aimlabs (2026). What Smoothness Actually Is and Why it makes Everything Else Better. Aim Labs Articles.',
    note: '滑らかさとは、照準を目標の速さに合わせ続けること。切り返しは急停止して振り直すのではなく、減速してから反対へ加速する。フリックも減速しながら近づくと修正なしで止めやすい。握る力が強すぎると照準が飛んだりブレたりし、弱すぎると遅れる。' },
  aimlabsControl: { short: 'Aim Labs: トラッキング制御', url: 'https://aimlabs.com/articles/?p=4612',
    full: 'Mr Aimlabs (2026). Looking to Improve Your Tracking Control? Check Out These Playlists! Aim Labs Articles.',
    note: '見失っても急に引き戻さず、目標の速さに合わせる。目標は今の向きに動き続けると考え、向きが変わったと確信してから直す。' },
  aimlabsReactive: { short: 'Aim Labs: 反応で追う', url: 'https://aimlabs.com/articles/?p=4180',
    full: 'Mr Aimlabs (2026). Stop Predicting and Start Reacting: Get Better at Reactive Tracking. Aim Labs Articles.',
    note: '予測で追うと相手に動きを崩される。反応で追うと切り返しの最初の瞬間はわずかに遅れるが、それは許容すべきコストで、遅れは練習で縮む。練習中に先読みしていると、反応ではなく予測を練習していることになる。' },
  aimlabsTrackOW: { short: 'Aim Labs: 中距離トラッキング', url: 'https://aimlabs.com/articles/?p=4024',
    full: 'Mr Aimlabs (2026). Tracking Opponents at Mid-Range in Overwatch. Aim Labs Articles.',
    note: '横移動 (ADAD) する相手を予測で追うと行き過ぎて、照準が長く外れる。予測より反応を優先する。' },
  aimlabsSwitch: { short: 'Aim Labs: スイッチ', url: 'https://aimlabs.com/articles/aimlabs/step-up-your-speed-switching-game/',
    full: 'Mr Aimlabs (2026). Step Up Your Speed Switching Game. Aim Labs Articles.',
    note: 'まず正確さを重視して課題に慣れ、その後に正確さを保ったまま速さを上げる。1 体を確実に倒してから次へ移る。動く目標は、照準が届くころにどこにいるかを把握しておく。' },
  aimlabsBasics: { short: 'Aim Labs: Aim Basics', url: 'https://aimlabs.com/articles/aimlabs/train-micros-and-flicking-in-counter-strike-2-with-the-aim-basics-routine/',
    full: 'Mr Aimlabs. Train Micros and Flicking in Counter-Strike 2 with the Aim Basics Routine. Aim Labs Articles.',
    note: '正しいフリックは「最初の大きな振り」と「小さな修正」で成り立つとし、両方を練習する課題を勧めている。' },
  exputer: { short: 'eXputer KovaaK\'s ルーティン', url: 'https://exputer.com/guides/valorant-best-kovaaks-aim-training-routine/',
    full: 'eXputer. 2400+ Hours In: Best KovaaK\'s Aim Training Routine For Valorant. (個人の経験にもとづくコミュニティ記事)',
    note: 'フリックでは目標と目標を結ぶ線をできるだけまっすぐにし、横のフリックは細かなブレなく滑らかに行うよう勧めている。' },
  rule: { short: '本アプリの経験則',
    full: '論文や競技エイムコミュニティの資料で直接確かめた内容ではなく、本アプリが一般的な考え方から設定した助言です。',
    note: '出典で確かめていない助言です。合わないと感じたら無視してかまいません。' },
};

const pct = (v) => `${Math.round(v * 100)}%`;
const DEG_ = Math.PI / 180;
const F = (text, src) => ({ text, src });
const ms = (v) => `${Math.round(v * 1000)}ms`;

// ---- 診断 ----
export function diagnose(result, sc, snap) {
  const m = result.metrics;
  const S = [], W = [], focus = [], gens = [];
  const cm = snap ? snap.cm360 : null;

  if (result.type === 'detect') {
    const ms_ = (v) => `${Math.round(v * 1000)}ms`;
    if (!isNaN(m.rtReverse) && !isNaN(m.rtFlash)) {
      if (m.motionCost > 0.1) {
        W.push({ key: 'motionPerception', title: '動きの変化に気づくのが遅い', sev: m.motionCost * 3,
          detail: `切り返しに気づくまで ${ms_(m.rtReverse)}、光ったことに気づくまで ${ms_(m.rtFlash)} で、動きの変化だけ ${ms_(m.motionCost)} 余分にかかっています。反応そのものより、「動きが変わった」と知覚する段階が弱点です。`,
          refs: ['soechting', 'rule'] });
        focus.push(F('目標の輪郭そのものを見て、動きが止まりかけた瞬間を捉える。照準や画面全体をぼんやり見ない', ['yang2025', 'rule']));
        focus.push(F('一般的な動体視力トレーニングより、遅い切り返しの目標で「見てから追う」練習を重ねる', ['appelbaum', 'rule']));
        gens.push('adad_slow');
      } else {
        S.push({ title: '動きの変化に気づく速さは十分', detail: `切り返しの検知 (${ms_(m.rtReverse)}) は、光の検知 (${ms_(m.rtFlash)}) とほぼ同じ速さです。トラッキングで切り返しに遅れるなら、原因は目より手の動き (止まる→反対へ動き出す) の側にある可能性が高いです。` });
      }
      if (m.rtFlash <= 0.26) {
        S.push({ title: '反応の速さは一般的な範囲', detail: `光ったことに気づいてクリックするまで ${ms_(m.rtFlash)} でした。若い成人の視覚の単純反応はおおむね 200〜250ms で、これには目で見てから指が動くまでの処理がすべて含まれます。さらにこの計測には、マウスのクリックや画面表示の遅れ (環境により数十 ms) も含まれます。200ms を超えるのは異常ではありません。` });
      }
      if (m.rtFlash > 0.36) {
        W.push({ key: 'generalReaction', title: '反応そのものが遅め', sev: m.rtFlash - 0.3,
          detail: `光ったことに気づいてクリックするまで ${ms_(m.rtFlash)} かかっています (視覚の単純反応は若い成人でおおむね 200〜250ms)。疲労や集中、表示の遅延も影響します。`,
          refs: ['rt', 'spjut'] });
        focus.push(F('疲れているときは休む。フレームレートが低い・全画面でないなど、表示の遅延を増やす要因も取り除く', ['spjut', 'rule']));
      }
    }
    if (m.falseClicks >= 4) {
      W.push({ key: 'anticipate', title: '合図の前にクリックしている', sev: 0.3,
        detail: `合図がないのに ${m.falseClicks} 回クリックしています。タイミングを予想して動く癖は、トラッキングでの先読みにもつながります。`,
        refs: ['aimlabsReactive'] });
      focus.push(F('合図を見てからクリックする。タイミングを予想しない', ['aimlabsReactive']));
    }
  }

  // ---- 自分が移動するシナリオ ----
  if (sc.player) {
    const ms_ = (v) => `${Math.round(v * 1000)}ms`;
    if (result.type === 'click' && sc.player.moveInaccuracy) {
      if (m.movingShotRate > 0.2) {
        W.push({ key: 'moveShoot', title: '動きながら撃っている', sev: m.movingShotRate,
          detail: `撃った弾の ${pct(m.movingShotRate)} が、最高速度の 30% を超える速さで撃たれていて、弾がぶれています。止まり切る前に撃っています。`,
          refs: ['valMove'] });
        focus.push(F('撃つ前に止まる。止まった瞬間に照準が合っているよう、動いている間に照準を目標へ寄せておく', ['valMove', 'rule']));
        gens.push('moveStop');
      } else if (m.movingShotRate < 0.05 && m.shots >= 10) {
        S.push({ title: '止まってから撃てている', detail: `動きながら撃った弾は ${pct(m.movingShotRate)} だけです。` });
      }
      if (m.stopToShot > 0.25) {
        W.push({ key: 'stopShot', title: '止まってから撃つまでが遅い', sev: m.stopToShot - 0.15,
          detail: `止まって (速さが 30% 以下になって) から撃つまで、中央値で ${ms_(m.stopToShot)} かかっています。止まってから照準を合わせ始めているため、撃てる状態の時間を無駄にしています。`,
          refs: ['rule'] });
        focus.push(F('止まる前から照準を合わせ始め、止まった瞬間に撃つ', ['rule']));
        gens.push('moveStop');
      }
      if (m.counterRate < 0.4 && m.stops >= 4) {
        W.push({ key: 'noCounter', title: 'カウンターストレイフをあまり使っていない', sev: 0.2,
          detail: `止まった ${m.stops} 回のうち、逆方向のキーを押して止まったのは ${pct(m.counterRate)} です。このシナリオでは、キーを離すだけだと止まるまで長くかかります (止まるまでの中央値 ${ms_(m.stopTime)})。なお VALORANT では、カウンターストレイフで縮む時間は小さく、効果に議論もあります。`,
          refs: ['valMove'] });
        focus.push(F('止まるときは、逆方向のキーを一瞬だけ押す', ['valMove']));
      }
    }
    if (result.type === 'track') {
      if (!isNaN(m.onMoving) && !isNaN(m.onStill) && m.onMoving < m.onStill * 0.8) {
        W.push({ key: 'moveTrack', title: '自分が動くと追従が崩れる', sev: m.onStill - m.onMoving,
          detail: `目標に乗っている割合は、自分が止まっているとき ${pct(m.onStill)}、動いているとき ${pct(m.onMoving)} です。自分の移動で目標が画面上を流れる分を、照準で打ち消し切れていません。`,
          refs: ['owRelative', 'rule'] });
        focus.push(F('自分が右へ動くと目標は左へ流れる。その分を照準で打ち消す。自分が切り返す瞬間に特に注意する', ['owRelative', 'rule']));
        gens.push('moveTrack');
      }
      if (sc.player.requireMoving && m.movingRatio < 0.6) {
        W.push({ key: 'notMoving', title: '移動している時間が短い', sev: 0.6 - m.movingRatio,
          detail: `移動中 (最高速度の 50% 以上) だったのはプレイ時間の ${pct(m.movingRatio)} です。このシナリオは移動中しかダメージにならないため、止まっている時間がそのまま失点になります。`,
          refs: [] });
        focus.push(F('A・D を押し続け、動きながら追う', []));
      }
    }
  }

  if (result.type === 'click' && !sc.spawnDelay) {
    const n = m.nTrials;
    if (n >= 6 && !isNaN(m.overRate)) {
      if (m.overRate > 0.35) {
        W.push({ key: 'overshoot', title: 'オーバーシュートが多い', sev: m.overRate,
          detail: `目標の ${pct(m.overRate)} で、照準が一度目標を通り過ぎています。行き過ぎた後の修正は向きの反転を伴い、手前で止めてから詰める修正より時間がかかります。`,
          refs: ['elliott', 'roberts', 'meyer'] });
        focus.push(F('目標に近づくにつれて減速し、少し手前で止めてから小さく詰める。最初は速さより止める位置を優先する', ['elliott', 'aimlabsSmooth']));
        gens.push('overshoot');
      } else if (m.overRate < 0.15 && m.onRate > 0.35) {
        S.push({ title: '止める精度が高い', detail: `行き過ぎは ${pct(m.overRate)} だけで、一次移動で目標に乗る割合は ${pct(m.onRate)} です。` });
      }
      if (m.underRate > 0.6 && m.corrections > 1.2) {
        W.push({ key: 'undershoot', title: '一次移動が短く、小刻みな修正が多い', sev: m.underRate,
          detail: `一次移動の ${pct(m.underRate)} が手前で止まり、1 体あたり平均 ${m.corrections.toFixed(1)} 回の修正をしています。手前で止まること自体は自然ですが、距離が大きく足りないと修正の回数と時間が増えます。`,
          refs: ['meyer', 'elliott'] });
        focus.push(F('一回目の振りで目標のすぐ手前まで届かせ、そこから一度だけ小さく合わせる', ['meyer', 'aimlabsBasics']));
        gens.push('undershoot');
      } else if (m.corrections < 0.6 && m.onRate > 0.3) {
        S.push({ title: '一回の動きで合わせられる', detail: `修正は平均 ${m.corrections.toFixed(1)} 回と少なく、効率的な照準です。` });
      }
      if (m.perpErr > 0.12) {
        W.push({ key: 'curve', title: '軌道が曲がっている', sev: m.perpErr,
          detail: `一次移動の終点が、目標方向から距離の ${pct(m.perpErr)} ほど横にずれています。軌道が弧を描くと、一次移動の後に横方向の修正が必要になります。`,
          refs: ['exputer'] });
        focus.push(F('照準から目標へまっすぐな線を引くように振る', ['exputer']));
      }
    }
    // 一振り目の精度 (視点とマウスの対応)
    if (!isNaN(m.gainCV)) {
      if (m.gainCV > 0.25) {
        W.push({ key: 'gainVar', title: '一振り目の振れ幅が毎回ばらつく', sev: m.gainCV - 0.15,
          detail: `一振り目で届いた距離が、目標の距離に対して平均 ${pct(m.gainMean)}、ばらつき (変動係数) ${m.gainCV.toFixed(2)} です。同じような距離でも、振れ幅が毎回変わっています。視点とマウスの対応 (どれだけ動かすとどれだけ回るか) がまだ安定していない状態です。`,
          refs: ['krakauer', 'meyer'] });
        focus.push(F('一振り目だけに集中し、毎回同じ感覚で目標のすぐ手前まで届かせる。修正は気にしない', ['meyer', 'rule']));
        focus.push(F('練習中は感度を変えない。変えた直後は対応の慣らし直しに時間がかかる', ['pearson', 'boudaoud']));
        gens.push('gainVar');
      } else if (m.gainCV < 0.15) {
        S.push({ title: '一振り目の振れ幅が安定している', detail: `一振り目の振れ幅のばらつきは ${m.gainCV.toFixed(2)} と小さく、視点とマウスの対応が安定しています。` });
      }
      if (!isNaN(m.gainNear) && !isNaN(m.gainFar) && m.gainNear - m.gainFar > 0.15) {
        W.push({ key: 'gainRange', title: '近い目標は振りすぎ、遠い目標は振り足りない', sev: m.gainNear - m.gainFar - 0.1,
          detail: `一振り目の振れ幅は、近い目標 (20° 未満) で ${pct(m.gainNear)}、遠い目標 (40° 以上) で ${pct(m.gainFar)} です。距離に関係なく中くらいの振れ幅に寄っていて、遠い目標ほど手前で止まり、近い目標ほど行き過ぎています。`,
          refs: ['krakauer', 'rule'] });
        focus.push(F('遠い目標は思い切って大きく、近い目標は小さく。振れ幅を距離に合わせて変える', ['rule']));
        gens.push('far');
      }
    }
    if (!isNaN(m.tiltDeg) && Math.abs(m.tiltDeg) > 2) {
      const cw = m.tiltDeg > 0;
      W.push({ key: 'mouseTilt', title: `マウスが${cw ? '時計回り' : '反時計回り'}に傾いて動いている (約 ${Math.abs(m.tiltDeg).toFixed(1)}°)`, sev: Math.abs(m.tiltDeg) / 6,
        detail: `一振り目が、どの向きに振っても同じ回転方向にずれています${!isNaN(m.arcDrift) ? ` (横に振ると、${cw ? '右は上・左は下' : '右は下・左は上'} にずれる)` : ''}。手を動かす向きに対して、マウスのセンサーが${cw ? '時計回り (前側が右)' : '反時計回り (前側が左)'}に約 ${Math.abs(m.tiltDeg).toFixed(1)}° 傾いた状態です。40° のフリックでは上下に約 ${(40 * Math.sin(Math.abs(m.tiltDeg) * DEG_)).toFixed(1)}° ずれ、小さな目標なら外れる大きさです。`,
        refs: ['sensorTilt', 'rule'] });
      focus.push(F(`マウスを${cw ? '少し反時計回り' : '少し時計回り'}に向け直すか、パッドの角度を腕の振りに合わせ、センサーが真横に動くように振る`, ['sensorTilt', 'rule']));
      gens.push('tilt');
    } else if (!isNaN(m.tiltDeg) && Math.abs(m.tiltDeg) < 1 && m.tiltN >= 10) {
      S.push({ title: 'マウスがまっすぐ動いている', detail: `一振り目の回転のずれは ${m.tiltDeg.toFixed(1)}° で、センサーが振りたい向きにまっすぐ動いています。` });
    }
    if (!isNaN(m.arcDrift) && Math.abs(m.arcDrift) > 0.05 && !W.some((w) => w.key === 'mouseTilt')) {
      const up = m.arcDrift > 0;
      W.push({ key: 'arcDrift', title: `横に振ると照準が${up ? '上' : '下'}に流れる`, sev: Math.abs(m.arcDrift) * 3,
        detail: `左右どちらに振っても、一振り目の終点が距離の ${pct(Math.abs(m.arcDrift))} ほど${up ? '上' : '下'}にずれています。マウスの傾きではなく、腕や手首が弧を描くときにセンサーが前後にも動いている可能性があります。`,
        refs: ['sensorTilt', 'rule'] });
      focus.push(F('横に振るときは、センサーが真横に動くことだけを意識する。マウス本体の軌道は弧でもよい', ['sensorTilt']));
      gens.push('tilt');
    }
    if (m.accuracy < 0.72 && m.shots >= 10) {
      W.push({ key: 'accuracy', title: '撃ち急ぎ (命中率が低い)', sev: 1 - m.accuracy,
        detail: `命中率は ${pct(m.accuracy)} です。照準が目標に乗る前、または止まる前に撃っている可能性が高いです。速さと正確さはトレードオフで、外した弾は時間を失います。`,
        refs: ['fitts'] });
      focus.push(F('照準が目標の上で止まったのを見てから撃つ。命中率 85% 以上を保てる速さに一度落とす', ['fitts', 'aimlabsSwitch']));
      gens.push('accuracy');
    } else if (m.accuracy > 0.93 && m.shots >= 10) {
      S.push({ title: '命中率が高い', detail: `命中率 ${pct(m.accuracy)}。正確さは十分です。` });
      if (result.rating < 70) {
        W.push({ key: 'slow', title: '慎重すぎる (速度に伸びしろ)', sev: 0.3,
          detail: `命中率が非常に高い一方で、1 体あたり ${ms(m.avgMT)} かかっています。速さと正確さのトレードオフ上で、正確側に寄りすぎている状態です。`,
          refs: ['fitts', 'mackenzie'] });
        focus.push(F('命中率を大きく落とさない範囲で、少しずつテンポを上げる', ['aimlabsSwitch', 'fitts']));
        gens.push('speed');
      }
    }
    if (!isNaN(m.onset)) {
      if (m.onset > 0.3) {
        W.push({ key: 'onset', title: '動き出しが遅い', sev: m.onset,
          detail: `目標が出てから照準が動き出すまで平均 ${ms(m.onset)} です。視覚の単純反応は 200〜250ms 程度なので、目標を探す・迷う時間が上乗せされています。`,
          refs: ['rt'] });
        focus.push(F('目標が見えたらすぐ動き出す。最初の動きは大まかでよく、近づいてから合わせる', ['rule']));
        gens.push('onset');
      } else if (m.onset < 0.22) {
        S.push({ title: '動き出しが速い', detail: `目標が出てから平均 ${ms(m.onset)} で照準が動き出しています。` });
      }
    }
    if (m.byDist) {
      const { near, mid, far } = m.byDist;
      if (far > 1.15 && far > (near || 1) + 0.12) {
        W.push({ key: 'far', title: '大きな角度のフリックが苦手', sev: far - 1,
          detail: `フィッツの法則で距離の影響を補正しても、40° 以上の目標は予測より ${pct(far - 1)} 遅くなっています。腕を使った大きな移動か、止める動作に課題があります。`,
          refs: ['fitts', 'boudaoud'] });
        focus.push(F('大きく振って目標の手前まで運び、最後の数度だけ細かく合わせる', ['meyer', 'rule']));
        gens.push('far');
      }
      if (near > 1.15 && near > (far || 1) + 0.12) {
        W.push({ key: 'near', title: '近距離の微調整が苦手', sev: near - 1,
          detail: `12° 未満の近い目標で予測より ${pct(near - 1)} 遅くなっています。小さな動きの精度 (指先・手首の制御) に課題があります。`,
          refs: ['fitts', 'meyer'] });
        focus.push(F('マウスを強く握らず、照準を小さく押し出すように合わせる', ['aimlabsSmooth', 'rule']));
        gens.push('near');
      }
    }
    if (m.byDir) {
      const d = m.byDir;
      const pairs = [['left', 'right', '左', '右'], ['up', 'down', '上', '下']];
      for (const [a, b, an, bn] of pairs) {
        if (isNaN(d[a]) || isNaN(d[b])) continue;
        const [slow, fast, sn] = d[a] > d[b] ? [d[a], d[b], an] : [d[b], d[a], bn];
        if (slow / fast > 1.18) {
          const dir = d[a] > d[b] ? a : b;
          W.push({ key: 'dir_' + dir, title: `${sn}方向への照準が遅い`, sev: slow / fast - 1,
            detail: `${sn}方向の目標は反対方向より ${pct(slow / fast - 1)} 遅くなっています (距離補正後)。腕の可動域、マウスパッドの位置、手首の角度を見直してください。`,
            refs: ['fitts'] });
          focus.push(F(`${sn}方向へ振るときに肘や手首が窮屈になっていないか確認する。机・パッドの位置も調整する`, ['rule']));
          gens.push('dir_' + dir);
          break;
        }
      }
      if (m.vertResid > 1.2 && m.vertResid > (m.horzResid || 1) + 0.15) {
        W.push({ key: 'vertical', title: '縦方向の照準が苦手', sev: m.vertResid - 1,
          detail: `縦成分の大きい目標が、横方向の目標より明らかに遅くなっています。横方向の練習に偏ると縦の制御が育ちにくいため、縦の目標も練習に混ぜましょう。`,
          refs: ['voltaic', 'rule'] });
        focus.push(F('縦方向の目標が多いシナリオも練習に混ぜ、上下にも左右と同じように振って止める', ['voltaic', 'rule']));
        gens.push('vertical');
      }
    }
    if (m.cvMT > 0.55 && m.nTrials >= 10) {
      W.push({ key: 'consistency', title: 'ムラが大きい', sev: m.cvMT - 0.5,
        detail: `1 体あたりの時間のばらつき (変動係数) が ${m.cvMT.toFixed(2)} と大きく、うまくいく時と崩れる時の差が大きい状態です。`,
        refs: ['practice'] });
      focus.push(F('毎回同じ手順 (見る→振る→止める→撃つ) で撃つ。速さより再現性を先に作る', ['rule']));
    }
  }

  if (sc.spawnDelay) {
    if (m.rt < 0.36) S.push({ title: '反応が速い', detail: `出現から撃破までの中央値 ${ms(m.rt)}、最速 ${ms(m.bestRT)}。` });
    else if (m.rt > 0.45) {
      W.push({ key: 'reaction', title: '反応から撃破までが遅い', sev: m.rt - 0.4,
        detail: `出現から撃破まで中央値 ${ms(m.rt)} です。反応時間そのもの (200〜250ms) に加え、照準の移動と撃つ判断に時間がかかっています。`,
        refs: ['rt', 'fitts'] });
      focus.push(F('出る位置やタイミングを予想せず、見えてから振って撃つ', ['rt']));
      gens.push('onset');
    }
    if (m.falseStarts >= 3) {
      W.push({ key: 'falsestart', title: 'フライングが多い', sev: 0.4,
        detail: `目標が出る前に ${m.falseStarts} 回撃っています。実戦では位置がばれたり弾を失ったりします。`, refs: ['rt'] });
      focus.push(F('目標が見えてから撃つ。タイミングを予想しない', ['rt']));
    }
  }

  if (result.type === 'track') {
    const ms_ = (v) => `${Math.round(v * 1000)}ms`;
    if (!isNaN(m.decelLat) && m.reversals >= 5) {
      if (m.decelLat > 0.2) {
        W.push({ key: 'revDetect', title: '切り返しに気づくのが遅い', sev: (m.decelLat - 0.15) * 3,
          detail: `目標が切り返してから、照準が減速し始めるまで平均 ${ms_(m.decelLat)} かかっています。目の追従でも、切り返しから減速が始まるまで約 90ms、向きが変わるまで約 130ms かかります。手の操作はそれより遅れるのが普通ですが、ここが長い場合は「動きの変化に気づく」段階に時間がかかっている可能性があります。目で気づくのが遅いのか、手の動きが遅いのかは「切り返し検知テスト」で切り分けられます。`,
          refs: ['soechting', 'rule'] });
        focus.push(F('照準ではなく目標そのものを見る。目標が視野の中心から外れるほど、変化に気づくのが遅れる', ['yang2025', 'rule']));
        focus.push(F('「切り返し検知テスト」で、目で気づく速さと手の動きのどちらが原因かを確かめる', ['rule']));
        gens.push('adad_slow');
      } else if (m.decelLat < 0.15) {
        S.push({ title: '切り返しに気づくのが速い', detail: `目標が切り返してから平均 ${ms_(m.decelLat)} で照準が減速し始めています。` });
      }
      if (m.transLat > 0.12) {
        W.push({ key: 'revTurn', title: '気づいてから反対へ動き出すまでが長い', sev: (m.transLat - 0.08) * 3,
          detail: `照準が減速し始めてから、反対方向へ動き出すまで平均 ${ms_(m.transLat)} かかっています。切り返しには気づけていますが、「止まる」から「動き出す」への切り替えで時間を失っています。`,
          refs: ['aimlabsSmooth', 'soechting'] });
        focus.push(F('止まり切ってから振り直さず、減速したらそのまま反対へ加速する', ['aimlabsSmooth']));
        focus.push(F('マウスを軽く持つ。握る力が強いと、反対への切り替えが遅れる', ['aimlabsSmooth']));
        gens.push('adad_rhythm');
      }
      if (m.revOvershoot > 0.35) {
        W.push({ key: 'revOvershoot', title: '切り返しで反対へ振りすぎる', sev: m.revOvershoot - 0.2,
          detail: `切り返しの ${pct(m.revOvershoot)} で、照準が新しい向きへ目標を追い越しています。追いつこうと一気に振ると、行き過ぎて戻す修正が増え、照準が目標から外れる時間が長くなります。`,
          refs: ['aimlabsSmooth'] });
        focus.push(F('切り返したら、目標と同じ速さまでで止める。追いつこうと一気に振らない', ['aimlabsSmooth']));
        gens.push('adad_slow');
      }
      if (m.rapidRatio > 1.25) {
        W.push({ key: 'revRapid', title: '短い間隔の切り返し (速い ADAD) に弱い', sev: m.rapidRatio - 1,
          detail: `前の切り返しから 0.45 秒以内に来た切り返しでは、反対へ動き出すまでの時間が、間隔が長いときの ${m.rapidRatio.toFixed(2)} 倍になっています。直前の切り返しへの対応が終わる前に次の切り返しが来て、遅れが重なっています。`,
          refs: ['rule'] });
        focus.push(F('短い切り返しでは大きく追わず、目標の中心付近で小さく往復する', ['rule']));
        gens.push('adad_fast');
      }
      if (m.anticipPerMin > 5) {
        W.push({ key: 'anticipate', title: '先読みで切り返している', sev: 0.4,
          detail: `目標が向きを変えていないのに照準が反転した回数が、1 分あたり ${m.anticipPerMin.toFixed(1)} 回ありました。読みが外れると照準が大きく外れます。不規則な切り返しを先読みしても当たる精度は低く、反応で追う方が外れる時間は短くなります。`,
          refs: ['aimlabsReactive', 'aimlabsTrackOW'] });
        focus.push(F('目標が向きを変えるまで今の動きを続ける。読みで切り返さない', ['aimlabsReactive', 'aimlabsControl']));
        gens.push('adad_slow');
      }
    }
    if (!isNaN(m.tiltOffset) && Math.abs(m.tiltOffset) > Math.max(0.25, 0.2 * (Array.isArray(sc.radius) ? sc.radius[0] : sc.radius))) {
      const cw = m.tiltOffset > 0;
      W.push({ key: 'mouseTilt', title: `マウスが${cw ? '時計回り' : '反時計回り'}に傾いて動いている可能性`, sev: Math.abs(m.tiltOffset),
        detail: `目標は真横にしか動いていないのに、照準は${cw ? '右へ追うときは上、左へ追うときは下' : '右へ追うときは下、左へ追うときは上'}に、それぞれ約 ${Math.abs(m.tiltOffset).toFixed(2)}° ずれています。横に動かすたびに照準が斜めに流れ、それを目で直し続けている状態です。マウスのセンサーが${cw ? '時計回り (前側が右)' : '反時計回り (前側が左)'}に傾いていると、このずれ方になります。正確な角度は「水平ライン・フリック」で測れます。`,
        refs: ['sensorTilt', 'rule'] });
      focus.push(F(`マウスを${cw ? '少し反時計回り' : '少し時計回り'}に向け直し、センサーが真横に動くように追う`, ['sensorTilt', 'rule']));
      gens.push('tilt');
    }
    if (m.fireRatio < 0.6) {
      W.push({ key: 'notfiring', title: '射撃ボタンを押していない時間が長い', sev: 0.5,
        detail: `左クリックを押していたのはプレイ時間の ${pct(m.fireRatio)} です。トラッキングは長押ししている間だけダメージになります。`, refs: [] });
      focus.push(F('トラッキングでは左クリックを押しっぱなしにする', []));
    }
    if (m.onRatio > expertRef(sc).ratio * 0.85) S.push({ title: '追従の精度が高い', detail: `目標に照準が乗っていた割合は ${pct(m.onRatio)} です。` });
    if (!isNaN(m.behindRate) && m.behindRate > 0.68 && m.onRatio < expertRef(sc).ratio) {
      const lagTxt = !isNaN(m.lagMs) ? `一定の動きの区間で、照準は目標の約 ${Math.round(m.lagMs * 1000)}ms 前の位置を追っています。` : '';
      if (m.behindAfterRevShare > 0.6 && !(m.lagMs > 0.07)) {
        // 遅れの大半が切り返し直後: 一定の動きには付いていけている
        W.push({ key: 'reversal', title: '切り返しの直後に遅れている', sev: m.behindRate - 0.5,
          detail: `目標の後ろで外れていた時間の ${pct(m.behindAfterRevShare)} は、目標が切り返した直後 0.4 秒以内です。${lagTxt}一定の動きにはほぼ遅れずに付いていけています。反応で追う以上、切り返しの最初の瞬間に少し遅れるのは避けられませんが、この遅れは練習で縮みます。`,
          refs: ['aimlabsReactive', 'orban'] });
        focus.push(F('切り返しを見たら、止まらずに減速して反対へ加速する。切り返し直後の遅れを小さくすることだけに集中する', ['aimlabsReactive', 'aimlabsSmooth']));
        gens.push('reversal');
      } else {
        // 一定の動きの区間でも、見えた位置を後から追っている
        W.push({ key: 'lag', title: '一定の動きでも目標の後ろを追っている', sev: m.behindRate - 0.5,
          detail: `外れていた時間の ${pct(m.behindRate)} は、照準が目標の後ろにありました。${lagTxt}切り返しのない区間でも、見えた位置を後から追っているため、ずれが縮まりません。目の追従の研究では、動きが一定で読める目標なら予測で遅れを小さくできることが分かっています (反対に、切り返しのような読めない動きでは予測は効きません)。`,
          refs: ['orban', 'aimlabsControl'] });
        focus.push(F('速さはそのままで、一度だけ前へ詰めて目標に重ね、そのまま同じ速さで運ぶ。一定の動きの間は、目標は今の向きに動き続けると考えてよい', ['orban', 'aimlabsControl']));
        gens.push('lag');
      }
    } else if (!isNaN(m.behindRate) && m.behindRate < 0.38 && m.onRatio < expertRef(sc).ratio) {
      W.push({ key: 'lead', title: '目標を追い越しがち', sev: 0.5 - m.behindRate,
        detail: `外れていた時間の ${pct(1 - m.behindRate)} は、照準が目標より前に出ていました。先読みが強すぎる可能性があります。予測で追うと行き過ぎて照準が長く外れやすくなります。`,
        refs: ['aimlabsReactive', 'aimlabsTrackOW'] });
      focus.push(F('先読みしすぎず、目標の実際の位置に照準を合わせる', ['aimlabsReactive', 'aimlabsTrackOW']));
      gens.push('lead');
    } else if (!isNaN(m.behindRate)) {
      S.push({ title: '前後のずれのバランスが良い', detail: '遅れと追い越しが偏っておらず、速さを合わせられています。' });
    }
    if (!isNaN(m.reversalLatency) && m.reversals >= 5) {
      if (m.reversalLatency > 0.24 && !W.some((w) => w.key === 'reversal' || w.key.startsWith('rev') || w.key === 'anticipate')) {
        W.push({ key: 'reversal', title: '切り返しへの反応が遅い', sev: m.reversalLatency - 0.2,
          detail: `目標が向きを変えてから照準が追従するまで平均 ${ms(m.reversalLatency)} かかっています。`,
          refs: ['rt', 'aimlabsReactive', 'voltaic'] });
        focus.push(F('先読みせず、切り返しを見てから追う。急停止せず、減速してから反対へ加速する', ['aimlabsReactive', 'aimlabsSmooth']));
        gens.push('reversal');
      } else if (m.reversalLatency < 0.19) {
        S.push({ title: '切り返しへの反応が速い', detail: `向きの変化から平均 ${ms(m.reversalLatency)} で追従しています。` });
      }
    }
    if (!isNaN(m.jitter) && m.jitter > 0.85) {
      W.push({ key: 'jitter', title: '照準がブレている (滑らかさ不足)', sev: m.jitter - 0.7,
        detail: `目標付近での照準と目標の速度差が、目標速度の ${pct(m.jitter)} あります。細かな加減速を繰り返す、ぎこちない追従です。マウスを握る力が強すぎることも原因になります。`,
        refs: ['aimlabsSmooth', 'voltaic'] });
      focus.push(F('握る力を見直し (強すぎるとブレ、弱すぎると遅れる)、一定の速さで滑らせる。外れても急に引き戻さない', ['aimlabsSmooth', 'aimlabsControl']));
      gens.push('jitter');
    } else if (!isNaN(m.jitter) && m.jitter < 0.55) {
      S.push({ title: '滑らかに追えている', detail: '照準の速度が目標の速度によく一致しています。' });
    }
    if (!isNaN(m.vertErrShare) && m.vertErrShare > 0.5 && sc.move.kind === 'smooth') {
      W.push({ key: 'vtrack', title: '縦方向の追従が甘い', sev: m.vertErrShare - 0.4,
        detail: `外れ量の ${pct(m.vertErrShare)} が縦方向のずれです。横の動きに比べて縦の制御が遅れています。`, refs: ['voltaic'] });
      focus.push(F('目標の高さの変化にも照準を合わせ続ける', ['voltaic']));
      gens.push('vertical_track');
    }
  }

  // 集中の持続
  if (m.fade < -0.18) {
    W.push({ key: 'fade', title: '後半に失速している', sev: -m.fade,
      detail: `後半の成績が前半より ${pct(-m.fade)} 落ちています。疲労や集中の切れ、力みが考えられます。`, refs: ['leegenovese', 'rule'] });
    focus.push(F('1 本ごとに短い休憩を入れる。疲れた状態で量をこなすより、集中できる本数で区切る', ['leegenovese']));
  } else if (m.fade > 0.15) {
    S.push({ title: '後半に伸びている', detail: 'ウォームアップ後に調子が上がるタイプです。練習前に軽い準備運動を入れると前半から実力を出せます。' });
  }

  // 感度についてのヒント (計測データに基づき、変更は慎重に)
  if (cm != null && result.type === 'click' && !sc.spawnDelay && m.nTrials >= 8) {
    if (m.overRate > 0.4 && cm < 22) {
      W.push({ key: 'sens_high', title: '感度が高すぎる可能性', sev: 0.2,
        detail: `振り向き ${cm.toFixed(1)}cm/360° で行き過ぎが多い状態です。最適な感度には速さと精度のトレードオフで決まる範囲があり、高すぎると止める精度が落ちます。`,
        refs: ['boudaoud'] });
      focus.push(F('感度を 1 割ほど下げて同じシナリオで比べてみる (一度に大きく変えない)', ['boudaoud', 'rule']));
    } else if (m.underRate > 0.65 && m.corrections > 1.4 && cm > 45 && m.byDist && m.byDist.far > 1.1) {
      W.push({ key: 'sens_low', title: '感度が低すぎる可能性', sev: 0.2,
        detail: `振り向き ${cm.toFixed(1)}cm/360° で大きな角度が届かず、修正が増えています。`, refs: ['boudaoud'] });
      focus.push(F('感度を 1 割ほど上げて同じシナリオで比べてみる (一度に大きく変えない)', ['boudaoud', 'rule']));
    }
  }

  W.sort((a, b) => b.sev - a.sev);
  return { strengths: S, weaknesses: W, focus: focus.filter((f, i) => focus.findIndex((x) => x.text === f.text) === i).slice(0, 4), gens: [...new Set(gens)] };
}

// ---- 弱点に合わせたシナリオ生成 ----
// rating に合わせて大きさを調整し、達成できる難易度から始める
export function generateScenario(kind, baseSc, rating) {
  const ease = rating < 45 ? 1.3 : rating < 70 ? 1.1 : 0.9;
  const id = 'gen_' + kind + '_' + Date.now().toString(36);
  const common = { id, generated: true, createdAt: Date.now(), hp: 1, defaultDuration: 60 };
  const T = {
    overshoot: { name: '止める練習: プレシジョン・フリック', category: 'flick', type: 'click', targets: 1, radius: 0.9 * ease,
      field: { yaw: 70, pitch: 25 }, spawn: { relative: true, minDist: 20, maxDist: 60 }, move: { kind: 'none' },
      desc: '小さめの目標を中〜遠距離に配置。手前で減速して止める動きを身につける。速さより止める位置を優先。', reason: 'オーバーシュートの矯正' },
    undershoot: { name: '一振り練習: コミット・フリック', category: 'flick', type: 'click', targets: 1, radius: 1.8 * ease,
      field: { yaw: 90, pitch: 22 }, spawn: { relative: true, minDist: 35, maxDist: 80 }, move: { kind: 'none' }, lifetime: 1.4,
      desc: '大きめの目標が遠くに出て、1.4 秒で消える。一回目の動きで届かせることを強制する。', reason: '一次移動の不足と小刻みな修正の改善' },
    accuracy: { name: '確実に撃つ: ワンショット', category: 'precision', type: 'click', targets: 1, radius: 0.8 * ease,
      field: { yaw: 40, pitch: 18 }, spawn: { relative: true, minDist: 8, maxDist: 30 }, move: { kind: 'none' },
      desc: '小さめの目標。撃つ前に照準が止まったことを確認する。目標は命中率 90%。', reason: '撃ち急ぎの改善' },
    speed: { name: 'テンポアップ: スピード・スイッチ', category: 'switching', type: 'click', targets: 4, radius: 1.9 * ease,
      field: { yaw: 30, pitch: 14 }, spawn: { relative: false }, move: { kind: 'none' },
      desc: '大きめの目標が 4 体。正確さに余裕があるので、テンポを上げることに集中する。', reason: '速度の向上' },
    onset: { name: '初動練習: クイック・リアクト', category: 'reaction', type: 'click', targets: 1, radius: 1.6 * ease,
      field: { yaw: 40, pitch: 15 }, spawn: { relative: true, minDist: 10, maxDist: 35 }, spawnDelay: [0.4, 1.2], lifetime: 1.2,
      move: { kind: 'none' }, defaultDuration: 45,
      desc: '短い間隔で広めの範囲に目標が出る。見えた瞬間に目線→手の順で動き出す練習。', reason: '動き出しの短縮' },
    far: { name: '大振り練習: 180° フリック', category: 'flick', type: 'click', targets: 1, radius: 2.2 * ease,
      field: { yaw: 150, pitch: 20 }, spawn: { relative: true, minDist: 60, maxDist: 150 }, move: { kind: 'none' },
      desc: '60〜150° の大きな振り向き。腕から動かして最後に手首で合わせる。', reason: '大角度フリックの強化' },
    near: { name: '微調整練習: マイクロ・タップ', category: 'precision', type: 'click', targets: 1, radius: 0.45 * ease,
      field: { yaw: 18, pitch: 12 }, spawn: { relative: true, minDist: 2, maxDist: 8 }, move: { kind: 'none' },
      desc: '照準のすぐそばに非常に小さな目標。指先の細かな制御を鍛える。', reason: '近距離の微調整' },
    vertical: { name: '縦フリック', category: 'flick', type: 'click', targets: 1, radius: 1.3 * ease,
      field: { yaw: 40, pitch: 40 }, spawn: { relative: true, minDist: 12, maxDist: 45, bias: { dir: 'vertical', weight: 0.75 } },
      move: { kind: 'none' }, desc: '縦方向に偏って目標が出る。縦の押し引きの制御。', reason: '縦方向の照準' },
    lag: { name: '先読みトラッキング', category: 'tracking', type: 'track', targets: 1, radius: 1.8 * ease, hpTime: Infinity,
      field: { yaw: 45, pitch: 10 }, spawn: { relative: false }, move: { kind: 'strafe', speed: 30, changeMin: 0.9, changeMax: 2.0 },
      desc: '一定の速さで長く動く目標。速さはそのままで一度前へ詰めて重ね、同じ速さで運ぶ。', reason: '追従遅れの改善' },
    lead: { name: '速度合わせトラッキング', category: 'tracking', type: 'track', targets: 1, radius: 1.4 * ease, hpTime: Infinity,
      field: { yaw: 40, pitch: 14 }, spawn: { relative: false }, move: { kind: 'smooth', speed: 20 },
      desc: '中速で滑らかに動く目標。照準を目標の中心に乗せて同じ速さで運ぶ。', reason: '追い越しの改善' },
    reversal: { name: '切り返し反応: ADAD ドリル', category: 'reactive', type: 'track', targets: 1, radius: 1.9 * ease, hpTime: Infinity,
      field: { yaw: 30, pitch: 6 }, spawn: { relative: false }, move: { kind: 'adad', speed: 26, changeMin: 0.35, changeMax: 0.9 },
      desc: '少し大きめの目標がランダムに切り返す。力を抜いて反対方向へすぐ動ける状態を保つ。', reason: '切り返しへの反応' },
    tilt: { name: '傾き矯正: 水平ライン', category: 'flick', type: 'click', targets: 1, radius: 1.0 * ease,
      field: { yaw: 100, pitch: 30 }, spawn: { relative: true, minDist: 25, maxDist: 90, axis: 'h' }, move: { kind: 'none' },
      desc: '照準と同じ高さに、左右にだけ小さめの目標が出る。センサーが真横に動くように振り、上下にずれないことだけに集中する。', reason: 'マウスの傾きの矯正' },
    moveStop: { name: 'ストップ&ショット: 大きめの目標', category: 'flick', type: 'click', targets: 1, radius: 1.5 * ease,
      field: { yaw: 25, pitch: 6 }, spawn: { relative: true, minDist: 4, maxDist: 15 }, move: { kind: 'none' },
      player: { mode: 'free', moveInaccuracy: true, requireMove: 1.5 },
      desc: '大きめの目標で「動く → 止まる → 撃つ」のリズムだけを練習する。止まる前から照準を寄せておく。', reason: '止まって撃つ動作' },
    moveTrack: { name: 'ストレイフ補正: ゆっくり', category: 'tracking', type: 'track', targets: 1, radius: 2.0 * ease, hpTime: Infinity,
      field: { yaw: 30, pitch: 4 }, spawn: { relative: false }, move: { kind: 'strafe', speed: 10, changeMin: 1.0, changeMax: 2.0 },
      player: { mode: 'auto', changeMin: 0.6, changeMax: 1.4 },
      desc: '目標はゆっくり、自分は自動で左右に動く。自分の移動で目標が流れる分を照準で打ち消す感覚だけを作る。', reason: '自分の移動の補正' },
    adad_slow: { name: '切り返しを見る練習: スロー ADAD', category: 'reactive', type: 'track', targets: 1, radius: 2.2 * ease, hpTime: Infinity,
      field: { yaw: 25, pitch: 4 }, spawn: { relative: false }, move: { kind: 'adad', speed: 16, changeMin: 0.5, changeMax: 1.3 },
      desc: '遅く大きな目標が、ゆっくりした間隔で不規則に切り返す。速さを落として、切り返しを「見てから」追う感覚を作る。', reason: '切り返しへの気づき' },
    adad_rhythm: { name: '切り返し動作の練習: リズム ADAD', category: 'reactive', type: 'track', targets: 1, radius: 2.0 * ease, hpTime: Infinity,
      field: { yaw: 25, pitch: 4 }, spawn: { relative: false }, move: { kind: 'adad', speed: 24, changeMin: 0.6, changeMax: 0.6, fixed: true },
      desc: '一定のリズム (0.6 秒ごと) で切り返す。動きが読めるので、目ではなく「減速→反対へ加速」の手の動きだけに集中できる。慣れたら不規則な ADAD に戻る。', reason: '切り返しの動作' },
    adad_fast: { name: '短い切り返し: クイック ADAD', category: 'reactive', type: 'track', targets: 1, radius: 1.9 * ease, hpTime: Infinity,
      field: { yaw: 20, pitch: 4 }, spawn: { relative: false }, move: { kind: 'adad', speed: 28, changeMin: 0.15, changeMax: 0.45 },
      desc: '短い間隔で細かく切り返す。大きく追わず、目標の中心付近で小さく往復する。', reason: '短い間隔の切り返し' },
    jitter: { name: 'スムーズネス・ドリル', category: 'tracking', type: 'track', targets: 1, radius: 2.0 * ease, hpTime: Infinity,
      field: { yaw: 35, pitch: 14 }, spawn: { relative: false }, move: { kind: 'smooth', speed: 14 },
      desc: 'ゆっくり滑らかに動く大きな目標。速さより、照準の動きを一定に保つことだけに集中する。', reason: '滑らかさの向上' },
    vertical_track: { name: '縦トラッキング', category: 'tracking', type: 'track', targets: 1, radius: 1.6 * ease, hpTime: Infinity,
      field: { yaw: 20, pitch: 25 }, spawn: { relative: false }, move: { kind: 'smooth', speed: 20 },
      desc: '縦の範囲が広い出現範囲で、上下の追従を鍛える。', reason: '縦方向の追従' },
  };
  if (kind.startsWith('dir_')) {
    const dir = kind.slice(4);
    const jp = { left: '左', right: '右', up: '上', down: '下' }[dir];
    return { ...common, name: `${jp}方向フリック`, category: 'flick', type: 'click', targets: 1, radius: 1.4 * ease,
      field: { yaw: 70, pitch: 30 }, spawn: { relative: true, minDist: 15, maxDist: 55, bias: { dir, weight: 0.7 } },
      move: { kind: 'none' }, desc: `${jp}方向に偏って目標が出る。苦手な方向の振りを集中的に練習する。`, reason: `${jp}方向の照準` };
  }
  const t = T[kind];
  if (!t) return null;
  const sc = { ...common, ...t };
  sc.radius = Math.round(sc.radius * 100) / 100;
  return sc;
}

// 弱点カテゴリから既存シナリオのおすすめ
export function recommendBuiltins(diag, sc) {
  const map = {
    overshoot: 'micro_precision', undershoot: 'flick_wide', accuracy: 'micro_precision', speed: 'switching_grid',
    onset: 'reaction', far: 'flick_wide', near: 'micro_precision', lag: 'track_smooth', lead: 'track_precise',
    reversal: 'track_reactive', jitter: 'track_precise', curve: 'flick_static', consistency: sc.id, fade: sc.id,
  };
  const ids = [];
  for (const w of diag.weaknesses) {
    const id = map[w.key];
    if (id && !ids.includes(id) && id !== sc.id) ids.push(id);
  }
  return ids.slice(0, 3).map(getScenario).filter(Boolean);
}
