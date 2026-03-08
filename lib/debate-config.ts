export interface DebateStage {
  id: string;
  name: string;
  side: "pro" | "con" | "both" | "judge";
  speaker: string;
  description: string;
  rounds?: number; // 自由辩论轮数
}

export const DEBATE_STAGES: DebateStage[] = [
  {
    id: "pro-opening",
    name: "开篇立论",
    side: "pro",
    speaker: "正方一辩",
    description: "阐述正方立场，提出核心论点和论据",
  },
  {
    id: "con-opening",
    name: "开篇立论",
    side: "con",
    speaker: "反方一辩",
    description: "阐述反方立场，提出核心论点和论据",
  },
  {
    id: "pro-rebuttal",
    name: "驳论",
    side: "pro",
    speaker: "正方二辩",
    description: "针对反方论点进行反驳，补充正方论据",
  },
  {
    id: "con-rebuttal",
    name: "驳论",
    side: "con",
    speaker: "反方二辩",
    description: "针对正方论点进行反驳，补充反方论据",
  },
  {
    id: "pro-cross",
    name: "质辩",
    side: "pro",
    speaker: "正方三辩",
    description: "针对反方逻辑漏洞发起质疑，追问核心矛盾",
  },
  {
    id: "con-cross",
    name: "质辩",
    side: "con",
    speaker: "反方三辩",
    description: "针对正方逻辑漏洞发起质疑，追问核心矛盾",
  },
  {
    id: "free-debate",
    name: "自由辩论",
    side: "both",
    speaker: "双方",
    description: "双方交替发言，快速攻防",
    rounds: 4,
  },
  {
    id: "con-closing",
    name: "总结陈词",
    side: "con",
    speaker: "反方四辩",
    description: "总结反方全部论点，做最后陈述",
  },
  {
    id: "pro-closing",
    name: "总结陈词",
    side: "pro",
    speaker: "正方四辩",
    description: "总结正方全部论点，做最后陈述",
  },
];

const BASE_RULES = `你是一位经验丰富、实力顶尖的辩论选手，具有以下特质：
- 逻辑严密，论证有力，善于构建完整的论证链条
- 善于引用真实的数据、案例和权威观点来支撑论点
- 语言精炼有力，富有感染力和说服力
- 能够准确抓住对方论点的逻辑漏洞并进行致命攻击
- 发言控制在300-500字
- 你全力以赴为自己的立场辩护，绝不轻易让步`;

export function buildSystemPrompt(
  side: "pro" | "con",
  topic: string,
  stage: DebateStage,
  isFreeSub?: "pro" | "con"
): string {
  const actualSide = isFreeSub || side;
  const sideLabel = actualSide === "pro" ? "正方" : "反方";
  const oppLabel = actualSide === "pro" ? "反方" : "正方";

  // 为反方添加额外的实力加成指令
  const conBoost =
    actualSide === "con"
      ? `\n重要：你代表反方，你的论辩实力极强。你要充分利用反方"后发制人"的优势——你可以在听到正方论点后找到更精准的攻击角度。你的论证要更加犀利、深刻，善于从更高维度和更深层次思考问题。不要只是防守，要主动出击，用强有力的论据压制对方。`
      : "";

  let stageInstruction = "";
  switch (stage.id) {
    case "pro-opening":
    case "con-opening":
      stageInstruction = `你现在是${sideLabel}一辩，需要进行开篇立论。
要求：
1. 先明确定义辩题中的关键概念，抢占定义权
2. 提出3个核心论点，每个论点都要有具体的论据支撑（真实数据、经典案例、权威引用）
3. 建立清晰的论证框架，形成逻辑闭环
4. 语言铿锵有力，开场要抓住注意力`;
      break;
    case "pro-rebuttal":
    case "con-rebuttal":
      stageInstruction = `你现在是${sideLabel}二辩，需要进行驳论。
要求：
1. 逐一分析${oppLabel}的论点，找出逻辑漏洞和薄弱环节
2. 用事实和逻辑反驳对方的核心论据，指出其论据的片面性
3. 同时补充${sideLabel}的新论据和新视角，加强己方论证
4. 保持攻守平衡，既要攻击对方也要巩固己方
5. 要提出对方无法轻易反驳的强力论据`;
      break;
    case "pro-cross":
    case "con-cross":
      stageInstruction = `你现在是${sideLabel}三辩，需要进行质辩。
要求：
1. 以犀利的问题揭露${oppLabel}论证中的矛盾和逻辑谬误
2. 用连续追问的方式让对方的论点自相矛盾
3. 引用对方自己的话来反驳对方，以子之矛攻子之盾
4. 语气尖锐但不失风度，展现高超的辩论技巧
5. 提出让对方难以回答的核心追问`;
      break;
    case "free-debate":
      stageInstruction = `你现在代表${sideLabel}参加自由辩论环节。
要求：
1. 发言简短有力，每次控制在100-150字
2. 直接回应对方最新的论点，不回避任何问题
3. 善于抓住对方的逻辑破绽进行攻击
4. 每次发言要有一个明确的攻击点或反击点
5. 用简洁有力的语言给对方施加压力`;
      break;
    case "con-closing":
    case "pro-closing":
      stageInstruction = `你现在是${sideLabel}四辩，需要进行总结陈词。
要求：
1. 总结全场辩论中${sideLabel}的核心论点和论证逻辑
2. 指出${oppLabel}在辩论中暴露的关键问题和逻辑硬伤
3. 升华${sideLabel}的立场，从更高层面阐述意义和价值
4. 结尾有力，给评委和观众留下深刻印象`;
      break;
  }

  return `${BASE_RULES}${conBoost}

辩题：${topic}
你的立场：${sideLabel}

${stageInstruction}

注意：直接输出你的发言内容，不要加任何角色前缀或标签。`;
}

export function buildJudgePrompt(topic: string): string {
  return `你是一位资深辩论赛评委，以严谨、公正著称。现在需要对一场辩论赛进行专业点评和总结。

辩题：${topic}

请根据双方的全部发言，严格按照以下标准进行评判：
- 论点的深度和创新性
- 论据的真实性和说服力
- 逻辑链条的完整性
- 反驳的有效性和针对性
- 语言表达的感染力

重要：你必须完全客观公正地评判，不要有任何偏向。如果反方的论证更有力、逻辑更严密、反驳更有效，就应该判反方获胜。谁的论证质量更高就判谁赢，不要默认正方获胜。

请生成一份专业的辩论赛评审报告，包含以下部分：

## 📊 辩论总评
对整场辩论的总体评价（2-3句话）

## 🔵 正方表现分析
- 核心论点总结
- 论证亮点
- 不足之处

## 🔴 反方表现分析
- 核心论点总结
- 论证亮点
- 不足之处

## ⚡ 精彩交锋
列出2-3个最精彩的攻防片段

## 🏆 评委裁定
给出最终判定（哪一方更有说服力），并详细说明理由。再次强调：必须基于实际辩论表现判定，不得有预设倾向。

## 💡 辩题延伸思考
对这个辩题的更深层思考和启示

请用Markdown格式输出，语言要专业、客观、有深度。`;
}
