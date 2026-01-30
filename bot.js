const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const lastFavor = {}; // anti-teste por usuário

function parseRoll(message) {
    const favor = message.startsWith('.');
    const explode = message.startsWith('E') || message.startsWith('e');
    let content = message;
    if (favor) content = content.slice(1);
    if (explode) content = content.slice(1);

    const match = content.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
    if (!match) return null;

    const numDice = Math.min(parseInt(match[1]), 50);
    const diceMax = Math.min(parseInt(match[2]), 1000);
    const modifier = match[3] ? parseInt(match[3]) : 0;

    return { numDice, diceMax, modifier, favor, explode };
}

function rollDie(max) {
    return Math.floor(Math.random() * max) + 1;
}

function favorRoll(max) {
    if (max <= 20) {
        return Math.floor(Math.random() * (max - 16)) + 17; // ≥17 para <=20
    } else {
        return Math.floor(Math.random() * Math.floor(max / 4)) + (max - Math.floor(max / 4) + 1);
    }
}

client.on('messageCreate', message => {
    if (message.author.bot) return;

    const roll = parseRoll(message.content.trim());
    if (!roll) return;

    const userId = message.author.id;
    let favorUsed = false;

    if (roll.favor && lastFavor[userId]) {
        roll.favor = false;
    }

    const results = [];
    for (let i = 0; i < roll.numDice; i++) {
        let result;
        if (roll.favor && !favorUsed) {
            result = favorRoll(roll.diceMax);
            favorUsed = true;
        } else if (roll.favor && i === roll.numDice - 1) {
            const maxDiff = Math.min(2, roll.diceMax - 1);
            result = roll.diceMax - Math.floor(Math.random() * (maxDiff + 1));
        } else {
            result = rollDie(roll.diceMax);
        }

        if (roll.explode && result === roll.diceMax) {
            let extra;
            do {
                extra = rollDie(roll.diceMax);
                result += extra;
            } while (extra === roll.diceMax);
        }

        results.push(result);
    }

    let total = results.reduce((a, b) => a + b, 0) + roll.modifier;
    const output = results.length > 1 ?
        `🎲 Rolou ${roll.numDice}d${roll.diceMax}:\n` +
        results.map((r, i) => `Dado ${i + 1}: ${r}`).join('\n') +
        `\nTotal: ${total}` :
        `🎲 Rolou ${roll.numDice}d${roll.diceMax} → ${total}`;

    if (!roll.favor && total < 5) {
        message.channel.send(output + ' 💀 Falha grave!');
    } else {
        message.channel.send(output);
    }

    lastFavor[userId] = roll.favor;
});

// Substitua 'SEU_TOKEN_AQUI' pelo token do seu bot
client.login('MTQ2NjgzNDYzMjEwMzI5NzI3Nw.GCmJt0.N8DmhQyoshxg7SCR2k6UNOznByRpf6CFxkJVw4');
