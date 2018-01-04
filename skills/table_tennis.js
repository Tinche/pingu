const fs = require('fs')
const _ = require('lodash');
const Elo = require('@pelevesque/elo')

module.exports = function(controller) {
  controller.hears(['^teams (.+) (.+) (.+) (.+)$'], 'direct_mention', function(bot, message) {
    console.log(message);
    var players = [message.match[1], message.match[2], message.match[3], message.match[4]];
    shuffle(players);
    
    bot.reply(message, ":pingpong: Team one: *" + players[0] + " and " + players[1] + "*, team two: *" + players[2] + " and " + players[3] + "*. Fight! :pingpong:");
  });
  
  controller.hears(['^leaderboard$'], 'direct_message,direct_mention', function(bot, message) {
    try {
    let scores = load_db().scores;
    let lb = _.chain(scores).map(function(score, user) {return {score: score, user: user}}).orderBy(['score', 'user'], ['desc', 'asc']).value();
    let msg = "    :trophy: Leaderboard :trophy:\n";
    msg += "\n\n";
    _.forEach(lb, function(row, idx) {
      msg += _.padStart((idx+1), 3) + ". <@" + row.user + ">" + ":  " + _.padStart(Math.round(row.score), 4) + "\n";
    });
    bot.reply(message, msg);
    } catch(err) {
      console.log(err);
    }
  });
  
  controller.hears(['^ranked <@(.+)> <@(.+)> <@(.+)> <@(.+)>$'], 'direct_mention', function(bot, message) {
    console.log('Received ranking request.');
    var players = [message.match[1], message.match[2], message.match[3], message.match[4]];
    
    var unique_players = players.filter(function(elem, pos) {
      return players.indexOf(elem) == pos;
    });
    
    if (unique_players.length != 4) {
      bot.reply(message, "Invalid number of unique players :(");
      return;
    }
    shuffle(unique_players);  // To randomize ties.
    
    let db = load_db();
    let scores = _.get(db, 'scores', {});
    let games = _.get(db, 'games', {});
    db.games = games;
    db.scores = scores;
    
    let p_s = _.map(unique_players, function(player) {
      return [player, _.get(scores, player, 1000)];
    });
    
    let teams = generate_teams(p_s);
    let team_a = teams[0];
    let team_b = teams[1];
    
    let game = create_game(games, team_a, team_b, message.event_time);
    let gameId = game.id;
    
    bot.reply(message, {
        attachments: [{
          title: ":pingpong: Team one: <@" + team_a[0] + "> and <@" + team_a[1] + ">   :crossed_swords:   team two <@" + team_b[0] + "> and <@" + team_b[1] + ">. Fight! :pingpong:",
          callback_id: game.id,
          attachment_type: 'default',
          actions: [
            {
              name: "team_a_win",
              text: "Team one WIN.",
              value: "taw",
              type: "button"
            }, 
            {
              name: "team_b_win",
              text: "Team two WIN.",
              value: "tbw",
              type: "button"
            }, 
//            {
//              name: "team_a_megawin",
//              text: "Team one MEGAWIN.",
//              value: "tam",
//              type: "button"
//            },
//            {
//              name: "team_b_megawin",
//              text: "Team two MEGAWIN.",
//              value: "tbm",
//              type: "button"
//            },
            {
              name: "draw",
              text: "Draw.",
              value: "draw",
              type: "button"
            },
            {
              name: "cancel",
              text: "Forget this game.",
              value: "cancel",
              type: "button"
            } 
          ]
        }]
    });
    
    save_db(db);
  });
  
  controller.on('interactive_message_callback', function(bot, message) {
    console.log('Interactive message callback');
    let gameId = parseInt(message.callback_id);
    let userId = message.user;
    let outcome = message.text;
    console.log('Outcome for ' + gameId + ' is ' + outcome + ', according to ' + userId);
    
    let db = load_db();
    let games = db.games;
    let game = _.get(games, message.callback_id);
    
    if ((!(_.includes(game.team_a, userId)) && !(_.includes(game.team_b, userId)))) {
      console.log('Unauthorized action.');
      bot.startPrivateConversation({user: userId}, function(err, convo) {
        convo.say("Naughty, naughty.");
      });
      return;
    }
    
    if (game.outcome !== 'pending') {
      console.log('Game already handled.');
      bot.replyInteractive(message, 'Game already handled.');
      return;
    }
    
    if (outcome === 'taw') {
      let res = win_game(db, gameId, 'team_a', 'team_b');
      save_db(db);
      bot.replyInteractive(message, "_Team one win. " + formatChanges(res) + "_");
    } else if (outcome === 'tbw') {
      let res = win_game(db, gameId, 'team_b', 'team_a');
      save_db(db);
      bot.replyInteractive(message, "_Team two win. " + formatChanges(res) + "_");
    } else if (outcome === 'draw') {
      let res = draw_game(db, gameId);
      save_db(db);
      bot.replyInteractive(message, "_Draw. " + formatChanges(res) + "_");
    } else if (outcome === 'cancel') {
      bot.replyInteractive(message, "_Game ignored._");
      cancel_game(db.games, gameId);
      save_db(db);
    }
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

function load_db() {
  try {
    return JSON.parse(fs.readFileSync('./.data/db.json', 'utf-8'));
  } catch (err) {
    return {};
  }
}

function save_db(db) {
  fs.writeFileSync('./.data/db.json', JSON.stringify(db, null, 2) , 'utf-8');
}

/**
 * Generate two teams.
 */
function generate_teams(players_with_scores) {
  console.log('Generating teams from ' + players_with_scores);
  players_with_scores = _.sortBy(players_with_scores, t => t[1]);
    
  let team_a = [players_with_scores[0][0], players_with_scores[3][0]];
  let team_b = [players_with_scores[1][0], players_with_scores[2][0]];
  
  let res = [team_a, team_b];
  console.log('Generated: ' + res);
  
  return res;
}

function create_game(games, team_a, team_b, ts) {
  let _id = 0
  if(!(_.isEmpty(games))) {
    _id = _.max(_.map(_.keys(games), function(e) {return parseInt(e);})) + 1;
     }
  let game = {
    id: _id,
    team_a: team_a,
    team_b: team_b,
    ts: ts,
    outcome: "pending"
  }
  _.set(games, _id, game);
  return game;
}

function cancel_game(games, id) {
  console.log("Cancelling.");
  let game = _.get(games, id);
  if (game.outcome == "pending") {
    game.outcome = "canceled";
  }
}

function win_game(db, id, team_won_name, team_lost_name) {
  let scores = db.scores;
  let games = db.games;
  let game = _.get(games, id);
  if (game.outcome != "pending") {
    return;
  }
  let winners = _.get(game, team_won_name);
  let losers = _.get(game, team_lost_name);
  
  let winnersElo = (_.get(scores, winners[0], 1000) + _.get(scores, winners[1], 1000)) / 2;
  let losersElo = (_.get(scores, losers[0], 1000) + _.get(scores, losers[1], 1000)) / 2;
  
  let elo = new Elo();
  
  let outcome = elo.getOutcome(winnersElo, losersElo, 1);
  
  let winDelta = outcome.a.delta;
  let loseDelta = outcome.b.delta;
  
  _.set(scores, winners[0], _.get(scores, winners[0], 1000) + (winDelta / 2));
  _.set(scores, winners[1], _.get(scores, winners[1], 1000) + (winDelta / 2));
  _.set(scores, losers[0], _.get(scores, losers[0], 1000) + (loseDelta / 2));
  _.set(scores, losers[1], _.get(scores, losers[1], 1000) + (loseDelta / 2));
  
  if (team_won_name === "team_a") {
    game.outcome = "taw";
  } else if (team_won_name == "team_b") {
    game.outcome = "tbw";
  }
  
  let res = {};
  _.set(res, winners[0], [winDelta/2, _.get(scores, winners[0])]);
  _.set(res, winners[1], [winDelta/2, _.get(scores, winners[1])]);
  _.set(res, losers[0], [loseDelta/2, _.get(scores, losers[0])]);
  _.set(res, losers[1], [loseDelta/2, _.get(scores, losers[1])]);
  
  return res;
}

function draw_game(db, id) {
  let scores = db.scores;
  let games = db.games;
  let game = _.get(games, id);
  if (game.outcome != "pending") {
    return;
  }
  
  let teamAElo = (_.get(scores, game.team_a[0], 1000) + _.get(scores, game.team_a[1], 1000)) / 2;
  let teamBElo = (_.get(scores, game.team_b[0], 1000) + _.get(scores, game.team_b[1], 1000)) / 2;
  
  let elo = new Elo();
  
  let outcome = elo.getOutcome(teamAElo, teamBElo, 0.5);
  
  let aDelta = outcome.a.delta;
  let bDelta = outcome.b.delta;
  
  _.set(scores, game.team_a[0], _.get(scores, game.team_a[0], 1000) + (aDelta / 2));
  _.set(scores, game.team_a[1], _.get(scores, game.team_a[1], 1000) + (aDelta / 2));
  _.set(scores, game.team_b[0], _.get(scores, game.team_b[0], 1000) + (bDelta / 2));
  _.set(scores, game.team_b[1], _.get(scores, game.team_b[1], 1000) + (bDelta / 2));
  
  game.outcome = "draw";
  
  let res = {};
  _.set(res, game.team_a[0], [aDelta/2, _.get(scores, game.team_a[0])]);
  _.set(res, game.team_a[1], [aDelta/2, _.get(scores, game.team_a[1])]);
  _.set(res, game.team_b[0], [bDelta/2, _.get(scores, game.team_b[0])]);
  _.set(res, game.team_b[1], [bDelta/2, _.get(scores, game.team_b[1])]);
  
  return res;
}

function formatChanges(res) {
  return "Changes: " + _.join(_.map(res, function(tuple, username) {
    return "<@" + username + "> " + tuple[0].toFixed(1) + " (" + tuple[1].toFixed(0) + ")"
  }), ', ') + ".";
}