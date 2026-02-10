require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const PROTAG_ID = '1296946227530829895';
const pityState = new Map();

// ===================== FRASES =====================
const frasesD20 = {
  critFalha: [
    "Seu fluxo de energia colapsa miseravelmente.",
    "Sukuna ri em algum lugar distante.",
    "Isso foi patético até para uma maldição fraca.",
    "O azar te abraça com força.",
    "Você falha de forma vergonhosa.",
    "A técnica implode antes de se formar.",
    "Você sente a maldição te rejeitar."
  ],
  falha: [
    "Nada explode, mas também não impressiona.",
    "Você tentou. Isso conta… mais ou menos.",
    "O resultado foi decepcionante.",
    "Sua técnica sai torta.",
    "Passou longe do ideal.",
    "Faltou controle de energia.",
    "A execução foi fraca."
  ],
  sucesso: [
    "Funcionou. Nada lendário, mas sólido.",
    "Você executa bem o suficiente.",
    "A energia flui sem resistência.",
    "Nada espetacular, mas eficiente.",
    "Você manda bem.",
    "Um uso correto da técnica.",
    "A maldição reage como esperado."
  ],
  critSucesso: [
    "Você é um maldito abençoado.",
    "A realidade pisca. Você venceu.",
    "Isso foi absurdo de bom.",
    "Até Sukuna respeita esse resultado.",
    "Você dobra o destino com facilidade.",
    "O fluxo amaldiçoado te obedece.",
    "Isso entra para a história."
  ]
};

// ===================== ITENS LENDÁRIOS =====================
const itensLendarios = [
  "🩸 **Dedo de Sukuna** — Poder colossal, mas extremamente corruptor.",
  "🧠 **Fragmento do Conhecimento de Kenjaku** — Técnicas roubadas e segredos proibidos.",
  "🗡️ **Lança Invertida do Céu** — Anula técnicas amaldiçoadas ao contato.",
  "📿 **Objeto Amaldiçoado de Grau Especial** — Instável, poderoso e imprevisível.",
  "👁️ **Relíquia de Tengen** — Afeta barreiras e as regras do mundo."
];

// ===================== UTILIDADES =====================
function rand(max) {
  return Math.floor(Math.random() * max) + 1;
}

function escolher(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function aplicarPity(userId, roll, mod) {
  if (userId !== PROTAG_ID) return roll;

  let state = pityState.get(userId) || 0;

  if (roll < 16) state++;
  else state = 0;

  pityState.set(userId, state);

  if (state >= 4) {
    const chance = Math.min(1, (state - 3) * 0.25);
    if (Math.random() < chance) {
      if (mod < 0) return Math.max(11, rand(20));
      return 19 + Math.floor(Math.random() * 2);
    }
  }

  return roll;
}

function fraseD20(roll) {
  if (roll === 1) return escolher(frasesD20.critFalha);
  if (roll <= 9) return escolher(frasesD20.falha);
  if (roll <= 18) return escolher(frasesD20.sucesso);
  return escolher(frasesD20.critSucesso);
}

// ===================== COMANDOS =====================
const commands = [
  new SlashCommandBuilder()
    .setName('rolar')
    .setDescription('Rola dados no formato XdY+Z+Z')
    .addStringOption(o =>
      o.setName('dados').setDescription('Ex: 1d20+3+3').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('vida')
    .setDescription('Rola aumento de vida')
    .addStringOption(o =>
      o.setName('dados').setDescription('Ex: 1d10+5').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('carisma')
    .setDescription('Teste de carisma')
    .addStringOption(o =>
      o.setName('dados').setDescription('Ex: 1d20+2').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('vontade')
    .setDescription('Teste de vontade')
    .addStringOption(o =>
      o.setName('dados').setDescription('Ex: 1d20-1').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('acao')
    .setDescription('Ação livre com recompensas')
    .addStringOption(o =>
      o.setName('mod').setDescription('Modificador opcional (ex: +2 ou -1)').setRequired(false)
    )
].map(c => c.toJSON());

// ===================== READY =====================
client.once('ready', async () => {
  await client.application.commands.set(commands);
  console.log('Bot online e comandos registrados');
});

// ===================== INTERAÇÕES =====================
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const userId = interaction.user.id;

  // -------- ROLAR / VIDA / CARISMA / VONTADE --------
  if (['rolar', 'vida', 'carisma', 'vontade'].includes(interaction.commandName)) {
    const input = interaction.options.getString('dados');

    const diceMatch = /^(\d+)d(\d+)/i.exec(input);
    if (!diceMatch) {
      return interaction.reply({ content: 'Formato inválido.', ephemeral: true });
    }

    let qtd = parseInt(diceMatch[1]);
    let faces = parseInt(diceMatch[2]);

    if (faces > 1000) {
      return interaction.reply({ content: 'Máximo de 1000 faces.', ephemeral: true });
    }

    const mods = input.match(/[+-]\d+/g) || [];
    const modifier = mods.reduce((acc, m) => acc + parseInt(m), 0);

    let rolls = [];
    let soma = 0;

    for (let i = 0; i < qtd; i++) {
      const r = rand(faces);
      rolls.push(r);
      soma += r;
    }

    let raw = (qtd === 1 && faces === 20) ? rolls[0] : null;
    if (raw !== null) raw = aplicarPity(userId, raw, modifier);

    const total = (raw !== null ? raw : soma) + modifier;

    let resposta =
      `**TOTAL: ${total}**\n` +
      `${qtd}d${faces} (${rolls.join(', ')}) ${mods.join(' ')} = ${total}`;

    if (raw !== null) resposta += `\n_${fraseD20(raw)}_`;

    if (interaction.commandName === 'carisma' && total < 13) {
      resposta += `\n❌ Falha no carisma.`;
    }

    await interaction.reply(resposta);
  }

  // -------- ACAO --------
  if (interaction.commandName === 'acao') {
    const modStr = interaction.options.getString('mod') || '+0';
    const modifier = parseInt(modStr);

    let roll = rand(20);
    roll = aplicarPity(userId, roll, modifier);
    const total = roll + modifier;

    let recompensa;
    if (roll >= 19) recompensa = `🔥 ITEM LENDÁRIO — ${escolher(itensLendarios)}`;
    else if (roll >= 11) recompensa = "✨ Item raro amaldiçoado.";
    else recompensa = "📦 Item comum ou moedas.";

    await interaction.reply(
      `**TOTAL: ${total}**\n1d20 (${roll}) ${modifier >= 0 ? '+' : '-'} ${Math.abs(modifier)} = ${total}\n${recompensa}`
    );
  }
});

client.login(process.env.TOKEN);