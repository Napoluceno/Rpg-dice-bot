// Carrega variável de ambiente e inicializa o cliente Discord
require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const client = new Client({ 
    intents: [GatewayIntentBits.Guilds] // Apenas Guilds são necessários para comandos slash
});

// Mapeia estados de 'pity' por usuário
const specialId = '1296946227530829895';  // substituir pelo ID real
const userState = new Map();

// Define os comandos slash (rolar, vida, carisma, ...)
client.once('ready', () => {
    const { SlashCommandBuilder } = require('@discordjs/builders');
    const commands = [
        new SlashCommandBuilder().setName('rolar').setDescription('Rola dados de RPG com mods (ex: 1d20+2+3)'),
        new SlashCommandBuilder().setName('vida').setDescription('Comando de vida (em desenvolvimento)'),
        new SlashCommandBuilder().setName('carisma').setDescription('Comando de carisma (em desenvolvimento)')
    ];
    client.application.commands.set(commands);
    console.log(`Bot ${client.user.tag} está online!`);
});

// Função utilitária: pega estado do usuário, inicializa se necessário
function getState(userId) {
    if (!userState.has(userId)) {
        userState.set(userId, { pityCount: 0, brakeCount: 0, pityActive: false, brakeActive: false });
    }
    return userState.get(userId);
}

// Função principal ao receber um comando /rolar
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand() || interaction.commandName !== 'rolar') return;

    let expr = interaction.options.getString('expression'); 
    // Supondo que o comando slash tenha um parâmetro de string 'expression'.
    // Se usar prefixos de texto, poderia ser: const expr = interaction.options.getString('expression');
    
    let explode = false;
    if (expr.startsWith('e ')) {
        explode = true;
        expr = expr.slice(2); // remove o "e " do começo
    }
    // Divide em partes pelo sinal '+'
    const parts = expr.split('+').map(s => s.trim());
    let total = 0;
    let rollDetails = []; // para armazenar cada valor de dado/resultado
    let dice1d20Value = null; // guardará o valor bruto do 1d20, se houver

    // Para cada parte (dado ou modificador)
    for (let part of parts) {
        if (part.includes('d')) {
            // Extraímos número e faces: e.g. '2d6' => num=2, sides=6
            let [numStr, sidesStr] = part.split('d');
            let num = parseInt(numStr) || 1;
            let sides = parseInt(sidesStr);
            // Rolar os dados
            for (let i = 0; i < num; i++) {
                let roll = Math.floor(Math.random() * sides) + 1;
                // Explosão de dado: continue rolando se cair no máximo
                if (explode) {
                    while (roll === sides) {
                        rollDetails.push(roll); // registra o valor máximo
                        roll = Math.floor(Math.random() * sides) + 1;
                    }
                }
                rollDetails.push(roll);
                total += roll;
                // Se for 1d20 simples (num=1 e faces=20), guardamos para sistema de pity/freio
                if (sides === 20 && num === 1 && dice1d20Value === null) {
                    dice1d20Value = roll;
                }
            }
        } else {
            // É um modificador fixo (número extra)
            let mod = parseInt(part);
            total += mod;
            rollDetails.push(mod);
        }
    }

    // Se o usuário for o especial, aplicamos pity/freio somente ao resultado do 1d20
    if (interaction.user.id === specialId && dice1d20Value !== null) {
        const state = getState(interaction.user.id);
        // Se pity estava ativo, força rolagem >=17
        if (state.pityActive) {
            dice1d20Value = 17 + Math.floor(Math.random() * 4); // um valor aleatório de 17 a 20
            // Remove o valor anterior do total e ajusta com o forçado
            total += (dice1d20Value - rollDetails[0]); 
            rollDetails[0] = dice1d20Value; // substitui no histórico
            state.pityActive = false;
            state.pityCount = 0;
        }
        // Se freio estava ativo, faz desvantagem
        else if (state.brakeActive) {
            let r1 = Math.floor(Math.random() * 20) + 1;
            let r2 = Math.floor(Math.random() * 20) + 1;
            let roll = Math.min(r1, r2);
            total += (roll - rollDetails[0]);
            rollDetails[0] = roll;
            dice1d20Value = roll;
            state.brakeActive = false;
            state.brakeCount = 0;
        }

        // Atualiza contadores de nova rolagem bruta
        if (dice1d20Value < 15) {
            state.pityCount += 1;
            state.brakeCount = 0;
        } else {
            state.pityCount = 0;
        }
        if (dice1d20Value >= 17) {
            state.brakeCount += 1;
            state.pityCount = 0;
        } else {
            state.brakeCount = 0;
        }
        // Ativa pity ou freio conforme necessário
        if (state.pityCount >= 3) {
            state.pityActive = true;
            state.pityCount = 0;
        }
        if (state.brakeCount >= 3) {
            state.brakeActive = true;
            state.brakeCount = 0;
        }
    }

    // Monta string com cálculo (ex: "18 + 2 = 20")
    const calcString = rollDetails.join(' + ') + ' = ' + total;
    // Escolhe frase temática aleatória com base no resultado
    const phrases = {
        high: [
            "Você canalizou o poder de Sukuna nessa rolagem!",
            "Domínio Expansion ativado — resultado monstruoso!",
            "Até Satoru Gojo ficaria impressionado!",
            "Black Flash de dado! Incrível!",
            "Maldições fogem diante de tanta precisão!",
            // ... (mais frases de sucesso)
        ],
        low: [
            "Uma falha épica — sinto cheiro de maldição!",
            "Nem Panda doongaria tanto azar.",
            "Que tragédia! Até Satoru suspiraria com pena.",
            "Se fosse uma técnica, daria Reprovado no check!",
            "Algo me diz que até o Sukuna teria vergonha disso.",
            // ... (mais frases de fracasso)
        ],
        normal: [
            "O dado rolou, e você segue em frente.",
            "Nada espetacular, mas sem desastre.",
            "Continua praticando — ainda há potencial!",
            "A sorte está neutra hoje.",
            "Rolagem dentro do esperado.",
            // ... (mais frases neutras)
        ]
    };
    let chosen;
    if (dice1d20Value !== null && dice1d20Value >= 17) {
        chosen = phrases.high[Math.floor(Math.random() * phrases.high.length)];
    } else if (dice1d20Value !== null && dice1d20Value <= 4) {
        chosen = phrases.low[Math.floor(Math.random() * phrases.low.length)];
    } else {
        chosen = phrases.normal[Math.floor(Math.random() * phrases.normal.length)];
    }

    // Envia a resposta ao canal
    await interaction.reply(`**${expr}** → ${calcString}\n*${chosen}*`);
});

// Faz login do bot (token carregado do .env)5
client.login(process.env.TOKEN);