module.exports = function(controller) {
  controller.hears(['^teams (.+) (.+) (.+) (.+)$'], 'direct_message,direct_mention', function(bot, message) {
    console.log(message);
    var players = [message.match[1], message.match[2], message.match[3], message.match[4]];
    shuffle(players);
    
    bot.reply(message, ":pingpong: Team one: *" + players[0] + " and " + players[1] + "*, team two: *" + players[2] + " and " + players[3] + "*. Fight! :pingpong:");
  });
};

/**
 * Shuffles array in place.
 * @param {Array} a items An array containing the items.
 */
function shuffle(a) {
    var j, x, i;
    for (i = a.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        x = a[i];
        a[i] = a[j];
        a[j] = x;
    }
}