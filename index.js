const { Client, GatewayIntentBits } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');

// Mapa para armazenar estado de pity/freio por usuário
const userState = {};

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Definição dos comandos slash com SlashCommandBuilder
const commands = [
    new SlashCommandBuilder()
        .setName('rolar')
        .setDescription('Role dados com uma expressão (ex: 1d20+2) com prefixo "e " para explosão')
        .addStringOption(option =>
            option.setName('expressao')
                  .setDescription('Expressão de rolagem (ex: 1d20+2)')
                  .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('vida')
        .setDescription('Mostra mensagem de vida'),
    new SlashCommandBuilder()
        .setName('carisma')
        .setDescription('Avalia seu carisma de forma divertida'),
    new SlashCommandBuilder()
        .setName('acao')  // nomes de comando só permitem letras sem acento
        .setDescription('Executa uma ação aleatória de Jujutsu Kaisen')
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
    console.log(`Bot online: ${client.user.tag}`);
    // Registra comandos no Discord (via API)
    await client.application.commands.set(commands);
    console.log('Comandos slash registrados.');
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const userId = interaction.user.id;
    if (interaction.commandName === 'rolar') {
        let expr = interaction.options.getString('expressao').trim();
        let exploding = false;
        // Prefixo 'e ' ativa explosão de dado
        if (expr.toLowerCase().startsWith('e ')) {
            exploding = true;
            expr = expr.slice(2);
        }

        // Inicializa estado do usuário, se ainda não existir
        if (!userState[userId]) {
            userState[userId] = { belowCount: 0, aboveCount: 0, pityActive: false, brakeActive: false };
        }
        const state = userState[userId];
        let total = 0;
        let details = [];

        // Função auxiliar para rolar um dado de X faces
        function rollDie(sides) {
            return Math.floor(Math.random() * sides) + 1;
        }

        // Lógica especial de pity/freio para 1d20 sem modificadores
        if (userId === '1296946227530829895' && !exploding && expr === '1d20') {
            if (state.pityActive) {
                // Força resultado 17-20
                const forced = 17 + Math.floor(Math.random() * 4);
                total = forced;
                details.push(`(pity) ${forced}`);
                state.pityActive = false;
                state.belowCount = 0;
            } else if (state.brakeActive) {
                // Desvantagem: rola 2d20 e pega menor
                const r1 = rollDie(20), r2 = rollDie(20);
                const rollValue = Math.min(r1, r2);
                total = rollValue;
                details.push(`(desvantagem) [${r1}, ${r2}] -> ${rollValue}`);
                state.brakeActive = false;
                state.aboveCount = 0;
            } else {
                // Rolagem normal de 1d20
                const rollValue = rollDie(20);
                total = rollValue;
                details.push(`${rollValue}`);
                // Atualiza contadores de pity/freio
                if (rollValue < 15) {
                    state.belowCount++;
                    state.aboveCount = 0;
                    if (state.belowCount >= 3) {
                        state.pityActive = true;
                        state.belowCount = 0;
                    }
                } else if (rollValue >= 17) {
                    state.aboveCount++;
                    state.belowCount = 0;
                    if (state.aboveCount >= 3) {
                        state.brakeActive = true;
                        state.aboveCount = 0;
                    }
                } else {
                    // 15 ou 16: reset
                    state.belowCount = 0;
                    state.aboveCount = 0;
                }
            }
        } else {
            // Parse genérico da expressão (ex: '2d6+3+1d4')
            const parts = expr.split('+');
            for (let part of parts) {
                part = part.trim();
                if (!part) continue;
                const diceMatch = part.match(/^(\d*)d(\d+)$/i);
                if (diceMatch) {
                    // Componente XdY
                    let count = parseInt(diceMatch[1]);
                    if (isNaN(count) || count === 0) count = 1;
                    const sides = parseInt(diceMatch[2]);
                    for (let i = 0; i < count; i++) {
                        if (exploding) {
                            // Explode o dado: soma repetidamente enquanto sair o máximo
                            let subtotal = 0, roll;
                            do {
                                roll = rollDie(sides);
                                subtotal += roll;
                            } while (roll === sides);
                            total += subtotal;
                            details.push(`${subtotal} (${count}d${sides} explodido)`);
                        } else {
                            // Rolagem simples
                            const roll = rollDie(sides);
                            total += roll;
                            details.push(`${roll} (d${sides})`);
                        }
                    }
                } else {
                    // Valor fixo (+N)
                    const value = parseInt(part);
                    if (!isNaN(value)) {
                        total += value;
                        details.push(`${value}`);
                    }
                }
            }
        }

        // Envia resposta ao comando /rolar
        await interaction.reply(
            `🎲 **${interaction.user.username}** rolou **${expr}**: **${total}**\n` +
            `Detalhes: ${details.join(', ')}`
        );

    } else if (interaction.commandName === 'vida') {
        await interaction.reply("Função de vida ainda está em desenvolvimento, mantenha-se vivo! 🍙");

    } else if (interaction.commandName === 'carisma') {
        const respostas = [
            "Seu carisma brilhou mais que o Gojo!",
            "Hm... foi só ok.",
            "Você espantou até o Panda."
        ];
        const escolha = respostas[Math.floor(Math.random() * respostas.length)];
        await interaction.reply(escolha);

    } else if (interaction.commandName === 'acao') {
        const acoes = [
            "Você ativa Black Flash contra a maldição!",
            "Invoca o domínio de Sukuna por 0.2 segundos.",
            "Recebe treinamento do Nanami — eficiência pura!"
        ];
        const acao = acoes[Math.floor(Math.random() * acoes.length)];
        await interaction.reply(acao);
    }
});

client.login(process.env.TOKEN);