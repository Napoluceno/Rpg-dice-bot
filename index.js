// Carrega variável de ambiente
require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ID do protagonista
const specialId = '1296946227530829895';

// Estado de pity/freio por usuário
const userState = new Map();

function getState(userId) {
  if (!userState.has(userId)) {
    userState.set(userId, {
      pityCount: 0,
      brakeCount: 0,
      pityActive: false,
      brakeActive: false
    });
  }
  return userState.get(userId);
}

// Registra comandos slash
client.once('ready', async () => {
  const commands = [
    new SlashCommandBuilder()
      .setName('rolar')
      .setDescription('Rola dados de RPG (ex: 1d20+2+3)')
      .addStringOption(option =>
        option
          .setName('expression')
          .setDescription('Exemplo: 1d20+2 ou 2d8+3+2')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('vida')
      .setDescription('Rola ganho de vida (em breve)'),

    new SlashCommandBuilder()
      .setName('carisma')
      .setDescription('Teste de carisma (em breve)')
  ];

  await client.application.commands.set(commands);
  console.log(`✅ Bot ${client.user.tag} online`);
});

// Comando /rolar
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;
  if (interaction.commandName !== 'rolar') return;

  let expr = interaction.options.getString('expression').toLowerCase();

  let explode = false;
  if (expr.startsWith('e ')) {
    explode = true;
    expr = expr.slice(2);
  }

  const parts = expr.split('+').map(p => p.trim());
  let total = 0;
  let rollDetails = [];
  let dice1d20Index = null;

  for (const part of parts) {
    if (part.includes('d')) {
      let [numStr, sidesStr] = part.split('d');
      let num = parseInt(numStr) || 1;
      let sides = parseInt(sidesStr);

      for (let i = 0; i < num; i++) {
        let roll = Math.floor(Math.random() * sides) + 1;

        if (explode) {
          while (roll === sides) {
            rollDetails.push(roll);
            roll = Math.floor(Math.random() * sides) + 1;
          }
        }

        if (sides === 20 && num === 1 && dice1d20Index === null) {
          dice1d20Index = rollDetails.length;
        }

        rollDetails.push(roll);
        total += roll;
      }
    } else {
      let mod = parseInt(part);
      rollDetails.push(mod);
      total += mod;
    }
  }

  // Sistema especial só para o protagonista
  if (interaction.user.id === specialId && dice1d20Index !== null) {
    const state = getState(interaction.user.id);
    let d20 = rollDetails[dice1d20Index];

    if (state.pityActive) {
      let forced = 17 + Math.floor(Math.random() * 4);
      total += forced - d20;
      rollDetails[dice1d20Index] = forced;
      state.pityActive = false;
      state.pityCount = 0;
      d20 = forced;
    } else if (state.brakeActive) {
      let r1 = Math.floor(Math.random() * 20) + 1;
      let r2 = Math.floor(Math.random() * 20) + 1;
      let forced = Math.min(r1, r2);
      total += forced - d20;
      rollDetails[dice1d20Index] = forced;
      state.brakeActive = false;
      state.brakeCount = 0;
      d20 = forced;
    }

    if (d20 < 15) {
      state.pityCount++;
      state.brakeCount = 0;
    } else if (d20 >= 17) {
      state.brakeCount++;
      state.pityCount = 0;
    } else {
      state.pityCount = 0;
      state.brakeCount = 0;
    }

    if (state.pityCount >= 3) {
      state.pityActive = true;
      state.pityCount = 0;
    }

    if (state.brakeCount >= 3) {
      state.brakeActive = true;
      state.brakeCount = 0;
    }
  }

  const calc = `${rollDetails.join(' + ')} = ${total}`;

  const frases = {
    high: [
      'A energia amaldiçoada flui perfeitamente.',
      'Um acerto digno de Sukuna.',
      'Essa rolagem impõe respeito.'
    ],
    low: [
      'A maldição riu da sua tentativa.',
      'Erro feio. Muito feio.',
      'A técnica falhou miseravelmente.'
    ],
    normal: [
      'A rolagem segue o fluxo.',
      'Nada extraordinário.',
      'Resultado estável.'
    ]
  };

  let comentario;
  const d20Final = dice1d20Index !== null ? rollDetails[dice1d20Index] : null;

  if (d20Final !== null && d20Final >= 17) {
    comentario = frases.high[Math.floor(Math.random() * frases.high.length)];
  } else if (d20Final !== null && d20Final <= 4) {
    comentario = frases.low[Math.floor(Math.random() * frases.low.length)];
  } else {
    comentario = frases.normal[Math.floor(Math.random() * frases.normal.length)];
  }

  await interaction.reply(`🎲 **${expr}**\n${calc}\n_${comentario}_`);
});

// Login
client.login(process.env.TOKEN);