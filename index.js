// index.js — versão com persistência, segurança /oculto e frases expandidas
require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, SlashCommandBuilder, PermissionsBitField } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

/* ----------------- CONFIG ----------------- */
const PROTAG_ID = '1296946227530829895';
const MAX_FACES = 1000;
const MAX_DICE = 1000;
const MAX_MODIFIERS = 10;
const STATE_FILE = './state.json';

/* ----------------- ESTADOS EM MEMÓRIA ----------------- */
/*
 userState Map stores objects:
 {
   pity: { countFail: number, cooldown: number },
   death: { success: number, fail: number },
   status: { nextAdvantage: bool, nextDisadvantage: bool, pendingDamage: number, nextTargetHasAdvantage: bool }
 }
*/
const userState = new Map();

/* ----------------- FRASES (expandidas) ----------------- */
const frasesD20 = {
  critFalha: [
    "O destino te abandona sem piedade.",
    "Sua energia amaldiçoada se volta contra você.",
    "A técnica falha de forma humilhante.",
    "Você tropeça no próprio fluxo espiritual.",
    "Algo dá errado. Muito errado.",
    "A maldição ri. Você não.",
    "Seu controle evapora no pior momento.",
    "Foi tão ruim que até espíritos fracos evitam comentar.",
    "O ambiente parece te rejeitar.",
    "Você cria tensão… e entrega desastre."
  ],
  desastre: [
    "Foi pior do que você imaginava.",
    "Nada saiu como planejado.",
    "Você perde completamente o controle.",
    "O ambiente se volta contra você.",
    "Erro crasso — dá trabalho consertar.",
    "A técnica se fragmenta."
  ],
  fraco: [
    "Você tenta, mas não convence.",
    "A técnica sai instável.",
    "Execução duvidosa.",
    "Resultado abaixo da média.",
    "Faltou gás no final.",
    "Conseguiu só por insistência."
  ],
  medio: [
    "Resultado aceitável.",
    "Nada brilhante, mas funcional.",
    "Execução estável.",
    "Você mantém o controle.",
    "Feito com precisão moderada.",
    "Suficiente para seguir."
  ],
  forte: [
    "Ótima execução.",
    "Controle refinado.",
    "Você domina a situação.",
    "Energia fluindo com precisão.",
    "Impacto notável.",
    "Técnica limpa e eficaz."
  ],
  critSucesso: [
    "Você distorce o próprio campo espiritual.",
    "Impacto devastador.",
    "A realidade parece ceder.",
    "Execução impecável.",
    "Você supera o limite.",
    "Energia amaldiçoada em estado puro.",
    "Momento lendário."
  ]
};

/* ----------------- ITENS / EVENTOS ----------------- */
const itensLendarios = [
  "🩸 Dedo de Sukuna — possível artefato (mestre decide se existe).",
  "🧠 Fragmento do Conhecimento de Kenjaku — segredo perigoso.",
  "🗡️ Lança Invertida — item único, narração do mestre.",
  "📿 Objeto Amaldiçoado de Grau Especial — instável e poderoso.",
  "👁️ Relíquia de Tengen — afeta barreiras (mestre decide efeito)."
];

const critFailEvents = [
  "1) Técnica explode: você sofre 1d4 de dano (mestre registra).",
  "2) Você fica exposto: próximo ataque contra você tem vantagem (mestre aplica).",
  "3) Perde o foco: próximo teste seu sofre desvantagem.",
  "4) Ambiente reage: o mestre cria uma complicação narrativa."
];

const critSuccessEvents = [
  "1) Recupera 1d4 HP (mestre aplica).",
  "2) Próximo teste seu tem vantagem.",
  "3) Intimidação automática / vantagem social em alvo comum.",
  "4) Benefício narrativo: o mestre concede vantagem em contexto."
];

/* ----------------- UTILS ----------------- */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/* escolher sem repetir a última frase do mesmo usuário (reduz repetição imediata) */
const lastPhraseMap = new Map();
function escolher(arr, userId = '__global') {
  if (!Array.isArray(arr) || arr.length === 0) return '';
  if (arr.length === 1) return arr[0];
  const last = lastPhraseMap.get(userId);
  let escolha;
  let attempts = 0;
  do {
    escolha = arr[Math.floor(Math.random() * arr.length)];
    attempts++;
  } while (escolha === last && attempts < 10);
  lastPhraseMap.set(userId, escolha);
  return escolha;
}

/* ----------------- PERSISTÊNCIA ----------------- */
function saveState() {
  try {
    const obj = Object.fromEntries(userState);
    fs.writeFileSync(STATE_FILE, JSON.stringify(obj, null, 2));
  } catch (err) {
    console.error('Erro ao salvar state:', err);
  }
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    for (const key of Object.keys(parsed)) {
      userState.set(key, parsed[key]);
    }
    console.log('Estado carregado do disk.');
  } catch (err) {
    console.error('Erro ao carregar state:', err);
  }
}

/* ----------------- PARSER ----------------- */
function parseDiceExpression(expr) {
  if (typeof expr !== 'string') return { ok: false, error: 'Expressão inválida.' };
  expr = expr.trim().toLowerCase();
  const m = /^(\d{1,4})d(\d{1,4})((?:[+-]\d+)*)$/i.exec(expr);
  if (!m) return { ok: false, error: 'Formato inválido. Use XdY ou XdY+Z (ex: 1d20+3+3-2).' };
  const count = parseInt(m[1], 10);
  const faces = parseInt(m[2], 10);
  const modsStr = m[3] || '';
  const mods = modsStr.length ? (modsStr.match(/[+-]\d+/g) || []) : [];
  if (mods.length > MAX_MODIFIERS) return { ok: false, error: `Máximo de ${MAX_MODIFIERS} modificadores.` };
  const modifier = mods.reduce((acc, v) => acc + parseInt(v, 10), 0);
  if (faces <= 0 || faces > MAX_FACES) return { ok: false, error: `Faces inválidas (1..${MAX_FACES}).` };
  if (count <= 0 || count > MAX_DICE) return { ok: false, error: `Quantidade inválida (1..${MAX_DICE}).` };
  return { ok: true, count, faces, mods, modifier };
}

/* ----------------- GET / INIT USER STATE ----------------- */
function getUserState(userId) {
  if (!userState.has(userId)) {
    userState.set(userId, {
      pity: { countFail: 0, cooldown: 0 },
      death: { success: 0, fail: 0 },
      status: { nextAdvantage: false, nextDisadvantage: false, pendingDamage: 0, nextTargetHasAdvantage: false }
    });
    // don't save immediately; will be saved on first mutation
  }
  return userState.get(userId);
}

/* ----------------- PITY (protagonista) ----------------- */
function applyPityIfEligible(userId, rawRoll, modifier) {
  if (userId !== PROTAG_ID) return rawRoll;
  const state = getUserState(userId);

  if (state.pity.cooldown && state.pity.cooldown > 0) {
    state.pity.cooldown -= 1;
    userState.set(userId, state);
    saveState();
    return rawRoll;
  }

  if (rawRoll < 16) state.pity.countFail = (state.pity.countFail || 0) + 1;
  else state.pity.countFail = 0;

  const c = state.pity.countFail || 0;
  if (c < 4) {
    userState.set(userId, state);
    saveState();
    return rawRoll;
  }

  const extraChance = Math.min(1, (c - 3) * 0.25); // 0.25,0.5,0.75,1
  const r = Math.random();

  if (r < extraChance) {
    if (modifier < 0) {
      const forced = Math.max(rawRoll, 11);
      if (extraChance === 1) {
        state.pity.countFail = 0;
        state.pity.cooldown = 3;
      }
      userState.set(userId, state);
      saveState();
      return forced;
    } else {
      const forced = 16 + Math.floor(Math.random() * 5); // 16..20
      if (extraChance === 1) {
        state.pity.countFail = 0;
        state.pity.cooldown = 3;
      }
      userState.set(userId, state);
      saveState();
      return forced;
    }
  }

  userState.set(userId, state);
  saveState();
  return rawRoll;
}

/* ----------------- EVENTOS CRÍTICOS ----------------- */
function handleCriticalEvents(userId, rawRoll) {
  const out = { messages: [], applied: {} };
  if (rawRoll === 1) {
    const ev = randInt(1, 4);
    const msg = critFailEvents[ev - 1];
    out.messages.push(`💥 Falha crítica (1 natural): ${msg}`);
    const state = getUserState(userId);
    if (ev === 1) {
      const dmg = randInt(1, 4);
      state.status.pendingDamage = (state.status.pendingDamage || 0) + dmg;
      out.messages.push(`⚠️ Dano marcado: ${dmg} (mestre aplica).`);
      out.applied.pendingDamage = dmg;
    } else if (ev === 2) {
      state.status.nextTargetHasAdvantage = true;
      out.messages.push('⚠️ Próximo ataque contra você tem vantagem (mestre aplica).');
      out.applied.nextTargetHasAdvantage = true;
    } else if (ev === 3) {
      state.status.nextDisadvantage = true;
      out.messages.push('⚠️ Próximo teste seu sofrerá desvantagem.');
      out.applied.nextDisadvantage = true;
    } else {
      out.messages.push('⚠️ Complicação narrativa — mestre decide.');
    }
    userState.set(userId, state);
    saveState();
  } else if (rawRoll === 20) {
    const ev = randInt(1, 4);
    const msg = critSuccessEvents[ev - 1];
    out.messages.push(`✨ Sucesso crítico (20 natural): ${msg}`);
    const state = getUserState(userId);
    if (ev === 1) {
      const heal = randInt(1, 4);
      out.messages.push(`❤️ Recupera ${heal} HP (mestre aplica).`);
      out.applied.heal = heal;
    } else if (ev === 2) {
      state.status.nextAdvantage = true;
      out.messages.push('✅ Seu próximo teste terá vantagem.');
      out.applied.nextAdvantage = true;
      userState.set(userId, state);
      saveState();
    } else if (ev === 3) {
      out.messages.push('✅ Resultado social favorável (mestre aplica).');
    } else {
      out.messages.push('✅ Benefício narrativo concedido pelo mestre.');
    }
  }
  return out;
}

/* ----------------- DEATH ----------------- */
function processDeathRoll(userId, raw) {
  const state = getUserState(userId);
  const death = state.death || { success: 0, fail: 0 };
  let resultMsg = '';

  if (raw === 20) {
    state.death = { success: 0, fail: 0 };
    userState.set(userId, state);
    saveState();
    return { finished: true, msg: '✨ 20 natural — você estabiliza e volta com 1 HP (mestre aplica).' };
  }

  if (raw === 1) {
    death.fail += 2;
    resultMsg += '💀 1 natural — conta como 2 falhas.\n';
  } else if (raw >= 10) {
    death.success += 1;
    resultMsg += '✅ Sucesso no teste de morte.\n';
  } else {
    death.fail += 1;
    resultMsg += '❌ Falha no teste de morte.\n';
  }

  if (death.success >= 3) {
    state.death = { success: 0, fail: 0 };
    userState.set(userId, state);
    saveState();
    return { finished: true, msg: resultMsg + '🩸 3 sucessos — você estabiliza.' };
  }
  if (death.fail >= 3) {
    state.death = { success: 0, fail: 0 };
    userState.set(userId, state);
    saveState();
    return { finished: true, msg: resultMsg + '💀 3 falhas — Você morreu.' };
  }

  state.death = death;
  userState.set(userId, state);
  saveState();
  return { finished: false, msg: resultMsg + `Progresso — Sucessos: ${death.success}/3 | Falhas: ${death.fail}/3` };
}

/* ----------------- BUILD SLASHS ----------------- */
const commands = [
  new SlashCommandBuilder()
    .setName('rolar')
    .setDescription('Rola dados no formato XdY+Z+... (ex: 1d20+3+3)')
    .addStringOption(o => o.setName('dados').setDescription('Expressão (ex: 1d20+3)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('vida')
    .setDescription('Rola aumento de vida (ex: 1d10+5)')
    .addStringOption(o => o.setName('dados').setDescription('Expressão (ex: 1d10+5)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('carisma')
    .setDescription('Teste de carisma (1d20+mod). Abaixo de 13 = falha')
    .addStringOption(o => o.setName('dados').setDescription('Expressão (ex: 1d20+2)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('vontade')
    .setDescription('Teste de vontade (1d20+mods)')
    .addStringOption(o => o.setName('dados').setDescription('Expressão (ex: 1d20+3)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('acao')
    .setDescription('Ação/Exploração — rola 1d20+mod e informa qualidade da descoberta (mestre decide loot)')
    .addStringOption(o => o.setName('dados').setDescription('Ex: 1d20+2').setRequired(true)),

  new SlashCommandBuilder()
    .setName('resistencia')
    .setDescription('Teste de resistência 1d20+mod (mod até ±100)')
    .addStringOption(o => o.setName('dados').setDescription('Ex: 1d20+5').setRequired(true)),

  new SlashCommandBuilder()
    .setName('morte')
    .setDescription('Teste de morte: 1d20 (1 = 2 falhas, 20 = estabiliza)'),

  new SlashCommandBuilder()
    .setName('oculto')
    .setDescription('Mestre: realiza teste oculto para um jogador (o jogador só verá "um teste foi feito")')
    .addUserOption(o => o.setName('alvo').setDescription('Jogador alvo').setRequired(true))
    .addStringOption(o => o.setName('dados').setDescription('Ex: 1d20+4').setRequired(true))
].map(c => c.toJSON());

/* ----------------- READY ----------------- */
client.once('ready', async () => {
  await client.application.commands.set(commands);
  loadState();
  console.log(`Bot online: ${client.user.tag}`);
});

/* ----------------- HANDLER ----------------- */
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = interaction.commandName;
  const userId = interaction.user.id;
  const userSt = getUserState(userId);

  function rollGeneric(parsed, options = {}) {
    const { count, faces, mods, modifier } = parsed;
    const rolls = [];
    let sum = 0;
    let rawSelected = null;
    const status = userSt.status || {};

    // advantage/disadv logic
    if (count === 1 && faces === 20 && (status.nextAdvantage || status.nextDisadvantage)) {
      if (status.nextAdvantage && status.nextDisadvantage) {
        const r = randInt(1, 20);
        rolls.push(r);
        rawSelected = r;
      } else if (status.nextAdvantage) {
        const r1 = randInt(1, 20), r2 = randInt(1, 20);
        rolls.push(r1, r2);
        rawSelected = Math.max(r1, r2);
      } else {
        const r1 = randInt(1, 20), r2 = randInt(1, 20);
        rolls.push(r1, r2);
        rawSelected = Math.min(r1, r2);
      }
      // clear flags and save
      status.nextAdvantage = false;
      status.nextDisadvantage = false;
      userSt.status = status;
      userState.set(userId, userSt);
      saveState();
      sum = rawSelected;
    } else if (count === 1 && faces === 20 && options.applyPityAllowed) {
      const r = randInt(1, 20);
      rolls.push(r);
      sum = r;
      rawSelected = r;
      if (userId === PROTAG_ID) {
        const afterPity = applyPityIfEligible(userId, rawSelected, modifier);
        rawSelected = afterPity;
        rolls[0] = rawSelected;
        sum = rawSelected;
      }
    } else {
      for (let i = 0; i < count; i++) {
        const r = randInt(1, faces);
        rolls.push(r);
        sum += r;
      }
    }

    const total = sum + modifier;
    return { rolls, sum, total, raw: rawSelected, mods };
  }

  /* ----------------- ROLL HANDLES ----------------- */
  if (['rolar', 'vida', 'carisma', 'vontade', 'resistencia'].includes(cmd)) {
    const input = interaction.options.getString('dados');
    const parsed = parseDiceExpression(input);
    if (!parsed.ok) return interaction.reply({ content: parsed.error, ephemeral: true });

    if (cmd === 'resistencia') {
      if (Math.abs(parsed.modifier) > 100) {
        return interaction.reply({ content: 'Modificador de resistência deve ser entre -100 e 100.', ephemeral: true });
      }
    }

    const applyPityAllowed = (cmd === 'rolar' || cmd === 'vontade') && parsed.count === 1 && parsed.faces === 20;
    const result = rollGeneric(parsed, { applyPityAllowed });

    const modsDisplay = (parsed.mods && parsed.mods.length) ? ` ${parsed.mods.join(' ')}` : '';
    const mathLine = `${parsed.count}d${parsed.faces} (${result.rolls.join(', ')})${modsDisplay} = ${result.total}`;

    let msg = `**TOTAL: ${result.total}**\n\`${mathLine}\``;

    if (result.raw !== null) {
      // choose phrase by ranges with less repetition per user
      let phrase = "";
      if (result.raw === 1) phrase = escolher(frasesD20.critFalha, userId);
      else if (result.raw <= 5) phrase = escolher(frasesD20.desastre || frasesD20.falha, userId);
      else if (result.raw <= 9) phrase = escolher(frasesD20.fraco || frasesD20.falha, userId);
      else if (result.raw <= 14) phrase = escolher(frasesD20.medio || frasesD20.sucesso, userId);
      else if (result.raw <= 18) phrase = escolher(frasesD20.forte || frasesD20.sucesso, userId);
      else phrase = escolher(frasesD20.critSucesso, userId);
      msg += `\n\n🎭 ${phrase} (d20 = ${result.raw})`;

      if (result.raw === 1 || result.raw === 20) {
        const ev = handleCriticalEvents(userId, result.raw);
        if (ev.messages.length) msg += `\n\n${ev.messages.join('\n')}`;
      }
    }

    if (cmd === 'carisma') {
      if (result.total < 13) msg += `\n\n❌ Falha no carisma.`;
      else if (result.total >= 19) msg += `\n\n✨ Sucesso excepcional!`;
      else msg += `\n\n✅ Sucesso.`;
    }

    if (cmd === 'vida') {
      if (parsed.modifier < 0) return interaction.reply({ content: 'Em /vida o modificador deve ser positivo (ou zero).', ephemeral: true });
    }

    await interaction.reply(msg);
    return;
  }

  /* ----------------- /acao ----------------- */
  if (cmd === 'acao') {
    const input = interaction.options.getString('dados');
    const parsed = parseDiceExpression(input);
    if (!parsed.ok) return interaction.reply({ content: parsed.error, ephemeral: true });

    const result = rollGeneric(parsed, { applyPityAllowed: false });
    const modsDisplay = (parsed.mods && parsed.mods.length) ? ` ${parsed.mods.join(' ')}` : '';
    const mathLine = `${parsed.count}d${parsed.faces} (${result.rolls.join(', ')})${modsDisplay} = ${result.total}`;

    let quality = 'Comum';
    let suggestion = null;
    const raw = result.raw ?? null;
    if (raw !== null) {
      if (raw >= 19) {
        quality = 'Épica';
        suggestion = escolher(itensLendarios, userId);
      } else if (raw >= 11) {
        quality = 'Rara';
      } else {
        quality = 'Comum';
      }
    } else {
      if (result.total >= parsed.count * parsed.faces * 0.9) quality = 'Épica';
      else if (result.total >= parsed.count * parsed.faces * 0.6) quality = 'Rara';
      else quality = 'Comum';
    }

    let msg = `**TOTAL: ${result.total}**\n\`${mathLine}\`\n\n🔎 **Qualidade da descoberta:** ${quality}`;
    if (suggestion) msg += `\n💡 Sugestão (mestre): ${suggestion} — o mestre decide se será encontrado.`;
    msg += `\n\nNota: itens lendários não são entregues automaticamente pelo bot; o mestre deve narrar a descoberta.`;

    if (raw !== null) {
      const phrase = (raw === 1) ? escolher(frasesD20.critFalha, userId) :
                     (raw <= 9) ? escolher(frasesD20.fraco, userId) :
                     (raw <= 18) ? escolher(frasesD20.medio, userId) :
                     escolher(frasesD20.critSucesso, userId);
      msg += `\n\n🎭 ${phrase} (d20 = ${raw})`;
    }

    await interaction.reply(msg);
    return;
  }

  /* ----------------- /morte ----------------- */
  if (cmd === 'morte') {
    const raw = randInt(1, 20);
    const res = processDeathRoll(userId, raw);
    await interaction.reply(`🎲 Rolou: ${raw}\n${res.msg}`);
    return;
  }

  /* ----------------- /oculto (mestre) ----------------- */
  if (cmd === 'oculto') {
    const isMaster =
      (interaction.member && (interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild) ||
       interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages))) ||
      (interaction.member && interaction.member.roles && interaction.member.roles.cache.some(r => r.name === 'Mestre'));

    if (!isMaster) {
      return interaction.reply({ content: 'Apenas o Mestre pode usar este comando.', ephemeral: true });
    }

    const target = interaction.options.getUser('alvo');
    const input = interaction.options.getString('dados');
    const parsed = parseDiceExpression(input);
    if (!parsed.ok) return interaction.reply({ content: parsed.error, ephemeral: true });

    await interaction.reply({ content: `🔒 Um teste oculto foi realizado para ${target.tag}. O jogador não verá o resultado.` });

    // compute result (no status flag changes)
    const rolls = [];
    let sum = 0;
    for (let i = 0; i < parsed.count; i++) {
      const r = randInt(1, parsed.faces);
      rolls.push(r);
      sum += r;
    }
    let raw = (parsed.count === 1 && parsed.faces === 20) ? rolls[0] : null;
    if (raw !== null && target.id === PROTAG_ID) {
      raw = applyPityIfEligible(target.id, raw, parsed.modifier);
      rolls[0] = raw;
      sum = raw;
    }
    const total = sum + parsed.modifier;
    const modsDisplay = (parsed.mods && parsed.mods.length) ? ` ${parsed.mods.join(' ')}` : '';
    const mathLine = `${parsed.count}d${parsed.faces} (${rolls.join(', ')})${modsDisplay} = ${total}`;

    await interaction.followUp({ content: `🔐 Resultado oculto para ${target.tag}:\n**TOTAL:** ${total}\n\`${mathLine}\``, ephemeral: true });
    return;
  }

  await interaction.reply({ content: 'Comando não implementado.', ephemeral: true });
});

/* ----------------- LOGIN ----------------- */
const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.error('Variável TOKEN ausente. Defina TOKEN no env.');
  process.exit(1);
}
client.login(TOKEN);