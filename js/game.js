$(document).ready(function() {
  var PS_EMPTY     = 0, // {{{
      PS_PLAY      = 1,
      PS_FOLD      = 2,
      PS_WAIT_BB   = 4,
      PS_SIT_OUT   = 8,
      PS_MAKEUP_BB = 16,
      PS_ALL_IN    = 32,
      PS_BET       = 64,
      PS_RESERVED  = 128,
      PS_AUTOPLAY  = 256,
      PS_MUCK      = 512,
      PS_OUT       = 1024; // }}}

  var cur_pid = 0, cur_gid = 0, cur_seat = 0, 
      watching = false, playing = false, 
      pot = 0, positions = null, seats_size = 0;
  var seats = [], private_card_index = 0, share_card_index = 0;
  var show_all = false;

  // {{{ initialization
  var initialization = function(args) { 
    cur_gid = args.gid;
    cur_pid = $(document).data("pid");

    if (args.show_all == true)
      show_all = true;

    if (args.seat == undefined)
      watching = true;

    $("#game_table").setTemplateElement("game_table_template");
    $("#game_table").processTemplate({end: 10});
  }; 

  var init_seats = function(size) {
    seats_size = size;

    if (positions == null) {
      positions = size == 5 ? five_positions : nine_positions;
    }

    $(".game_seat, .empty_seat").hide();

    // init seats outer position
    for (var i = 1; i <= size ; i++) {
      $("#game_seat_" + i).css(positions[i].outer);
      $("#empty_seat_" + i).css(positions[i].empty_outer);
    }

    console.log("init_seats");
  };

  var get_seat = function(sn) {
    return $("#game_seat_" + sn);
  };

  var get_empty_seat = function(sn) {
    return $("#empty_seat_" + sn);
  };

  var get_seat_number = function(pid) {
    var sn = 0;
    $.each(seats, function(i, s) {
      if (s == undefined)
        return;

      if (s.pid == pid) {
        sn = s.sn;
      }
    });

    return sn;
  };

  var get_poker = function(face, suit) {
    var a = new Number(face << 8 | suit);
    return $.rl.poker[a.toString()];
  };

  var ps_fold = function(sn) {
    var seat = seats[sn];
    var s = get_seat(sn);

    s.addClass("ps_fold");
    if (seat.pid == cur_pid) {
      $(".private_card").addClass("ps_fold");
    } else {
      s.children(".card").hide("slow");
    }
  };

  var ps_play = function(sn) {
    var seat = seats[sn];
    var s = get_seat(sn);
    s.removeClass("ps_fold");
    if (seat.pid == cur_pid) {
      $(".private_card").removeClass("ps_fold");
    }
  };

  // 更新座位信息,需要参数中携带座位编号,昵称,带入金额.
  var reload_seat = function(sn) {
    var seat = seats[sn];
    var s = get_seat(sn);
    var e = get_empty_seat(sn);

    if (seat == undefined) {
      s.hide();
      e.show(450);
    }
    else {
      e.hide();

      console.log("seat.state", seat);

      if (seat.state == PS_FOLD) {
        ps_fold(sn);
      }

      if (seat.state == PS_PLAY) {
        ps_play(sn);
      }

      // 对玩家显示区进行基本设置
      s.children('.inplay').text(seat.inplay).parent().
        children('.nick').text(seat.nick).parent().
        children('.photo').attr('player', seat.pid).parent().
        show(450);

      $.ws.send($.pp.write({cmd: "PHOTO_QUERY", id: seat.pid}));
    }
  };

  var update_seat = function(seat) {
    if (seat.state == PS_EMPTY) {
      seats[seat.sn] = undefined;
    } else {
      if (seats[seat.sn] == undefined) {
        seat.betting = 0;
        seats[seat.sn] = seat;
      }
      else {
        seat.betting = seats[seat.sn].betting;
        seats[seat.sn] = seat;
      }
    }

    reload_seat(seat.sn);
  };

  var trim_position = function(offset) {
    var t = positions.shift();
    for (var i = 1; i <= offset; i++) {
      positions.unshift(positions.pop());
    }
    positions.unshift(t);


    for(var i = 1; i <= seats_size; i++) {
      $("#game_seat_" + i).css(positions[i].outer);
      $("#empty_seat_" + i).css(positions[i].empty_outer);
    }
  };

  var fan = function(i) {
    if (i == 0)
      return i;
    else if (i > 0)
      return 0 - i;
    else
      return Math.abs(i);
  };

  var get_bets = function(bet) { // {{{
    // generate bet animation
    var bets = [];
    var maxs = [
      {key: 100, val: "betting_1"},
      {key: 50, val: "betting_2"}, 
      {key: 20, val: "betting_3"}, 
      {key: 10, val: "betting_4"}, 
      {key: 5, val: "betting_5"}
    ];

    while (true) {
      var max = maxs.shift();
      var l = Math.floor(bet / max.key);
      for (var i = 1; i <= l; i++) {
        bets.push(max.val);
      }

      bet = bet % max.key;

      if (maxs.length == 0) {
        if (bet != 0)
          bets.push(max.val);

        break;
      }
    }

    return bets;
  } // }}}

  var random = function(ori, x, y) {
    var left = new Number(Math.floor((Math.random() * 100)) % x + ori.left);
    var top = new Number(Math.floor((Math.random() * 100)) % y + ori.top);
    
    return {left: left + "px", top: top + "px"};
  }

  var set_betting = function(seat, bet) {
    seats[seat].betting = seats[seat].betting + bet;
    pot += bet;

    var b = get_seat(seat).
      children(".betting_label").
      css(positions[seat].betting_label).
      text(bet).
      show();

    var bets = get_bets(bet);

    $.each(bets, function(i, x) {
      $('<img class="bet" />').attr("src", $.rl.img[x]).css(positions[seat].betting_ori).appendTo('#game_table').animate(random(positions[seat].betting, 7, 7), 450);
    });
  };

  var new_stage = function() {
    var sum = 0;

    $('.bet').each(function() {
      $(this).animate(random({left: 571, top: 227}, 20, 20), 350).removeClass('bet').addClass('pot');
    });

    for (var i = 1; i <= seats_size; i++) {
      get_seat(i).children(".betting_label").text("").hide();
      if (seats[i] != undefined) {
        sum += seats[i].betting;
      }
    }

    $('.pot_label').show().text(sum);
  }

  var showall = function() {
    if (show_all == false)
      return; 

    for (var i = 1; i < seats_size + 1; i ++) {
      update_seat({inplay: 123456, sn: i, nick: '玩家昵称', pid: 1, state: PS_PLAY, betting: 0});
      get_seat(i).children('.betting_label').css(positions[i].betting_label).text("1000").show();
      get_seat(i).children('.card').css(positions[i].card).show();
    }
  };
  // }}}
  var audio = new Audio("css/sound/test.mp3");
  
  var share_pot = function(seats) {
    var l = seats.length;
    var c = Math.floor($(".pot").length / l);

    var s = 0;
    var tp = 100;
    $(".pot").each(function(i, x) {
      if ((i % c) == 0) {
        var t = seats.shift();
        s = (t == undefined) ? s : t;
      }

      var pp = $(this);
      var ss = s;

      $(document).oneTime(tp, function() {
        $(pp).animate(positions[ss].betting_ori, 650, function() {
          $(this).remove();
        });
      });

      tp += 20;
    });

    audio.play();
  };

  // event {{{
  $('#game').bind('active', function(event, args) {
    initialization(args);

    // not setting seat is watch game
    var cmd = watching == true ? {cmd: "WATCH", gid: cur_gid} : 
      {cmd: "JOIN", gid: cur_gid, seat: args.seat, buyin: 100};
    console.log(cmd);
    $.ws.send($.pp.write(cmd));
  });

  $('#cmd_stand').click(function() {
    for (var i = 1; i <= seats_size; i++) {
      set_betting(i, Math.floor(Math.random() * 100));
    };

    new_stage(1);
  });

  $('#cmd_hall').click(function() {
    //seats[get_seat_number(cur_pid)].state = PS_FOLD;
    //reload_seat(get_seat_number(cur_pid));
    //
    //
    share_pot([1,2,3]);
  });

  $('#cmd_fold').click(function() {
    $.ws.send($.pp.write({cmd: "FOLD", gid: cur_gid}));
  });

  $('#cmd_call').click(function() {
    $.ws.send($.pp.write({cmd: "RAISE", gid: cur_gid, amount: 0}));
  });

  $('#cmd_raise').click(function() {
    a = parseInt($('#raise_range').val());
    $.ws.send($.pp.write({cmd: "RAISE", gid: cur_gid, amount: a}));
  });

  $('#raise_range').bind('change', function(event) {
    var v = parseInt($(this).val());
    var max = parseInt($(this).attr("max"));

    if (v == max)
      $('#cmd_raise').text("ALL-IN " + v);
    else 
      $('#cmd_raise').text("加注 " + v);
  });
  // }}}

  // protocol {{{
  $.pp.reg("GAME_DETAIL", function(detail) { 
    console.log([tt(), "game_detail", detail]);

    if (detail.gid != cur_gid) 
      throw 'error notify_game_detail protocol';

    init_seats(detail.seats);
  });

  $.pp.reg("SEAT_DETAIL", function(seat) {
    if (is_disable())
      return;

    console.log(
      [tt(),"init_seat", "seat_detail", "seat", seat.sn, "pid", 
        seat.pid, "state", seat.state, "inplay", 
        seat.inplay, "nick", seat.nick]
    );

    if (seat.gid == cur_gid) {
      update_seat({inplay: 1000, sn: seat.sn, nick: seat.nick, pid: seat.pid, state: seat.state});
      return;
    }

    throw 'error seat_detail protocol'
  });

  $.pp.reg("SEAT_STATE", function(seat) { 
    if (is_disable())
      return;

    console.log(
      [tt(),"seat_state", "seat", seat.sn, "pid", 
        seat.pid, "state", seat.state, "inplay", 
        seat.inplay, "nick", seat.nick]
    );

    if (seat.gid == cur_gid) {
      update_seat({inplay: 1000, sn: seat.sn, nick: seat.nick, pid: seat.pid, state: seat.state});
      return;
    }

    throw 'error seat_state protocol'
  }); 

  $.pp.reg("PHOTO_INFO", function(player) { 
    if (is_disable())
      return;

    var photo = $("#game_table div .photo:[player=" + player.id + "]");

    if (player.photo.indexOf('def_face_') == 0)
      $(photo).attr('src', $.rl.img[player.photo]);
    else if (player.photo.indexOf('base64'))
      $(photo).attr('src', player.photo);
    else 
      $(photo).attr('src', $.rl.img.def_face_0);
  });

  $.pp.reg("CANCEL", function(notify) { 
    if (notify.gid == cur_gid) {
      //console.log([tt(),'notify_cancel', notify]);
      return;
    }

    throw 'error notify_cancel protocol'
  });

  $.pp.reg("START", function(notify) { 
    if (notify.gid == cur_gid) {
      console.log([tt(),'notify_start', notify]);
      return;
    }

    throw 'error notify_start protocol'
  });

  $.pp.reg("JOIN", function(notify) { 
    console.log(
      [tt(),'notify_join', "pid", notify.pid, "nick", notify.nick,
       "buyin", notify.buyin, "seat", notify.seat, notify
    ]);

    if (notify.gid == cur_gid) {
      if (notify.pid == cur_pid) {
        playing = true;
        watching = false;

        // 根据当前玩家的座位号调整一次座位顺序
        trim_position(notify.seat - 1);
      }

      update_seat({
        sn: notify.seat, pid: notify.pid, 
        nick: notify.nick, inplay: notify.buyin
      });

      showall();
      return;
    }

    throw 'error notify_join protocol';
  });

  

  $.pp.reg("BUTTON", function(notify) { 
    console.log([tt(),'notify_button', notify]);

    var s = get_seat(notify.seat);
    s.children('.button').show();
  });

  $.pp.reg("SBLIND", function(notify) { 
    console.log([tt(),'notify_sb', notify]);
  });

  $.pp.reg("BBLIND", function(notify) { 
    console.log([tt(),'notify_bb', notify]);
  });

  $.pp.reg("BET_REQ", function(req) { 
    console.log([tt(),'notify_bet_request', 'call', req.call, 'min', req.min, 'max', req.max]);

    $('#raise_range').
      attr('min', req.min).
      attr('max', req.max).
      val(req.min);
  });

  $.pp.reg("PRIVATE", function(notify) { 
    console.log([tt(),'notify_private', 'pid', notify.pid, 'suit', notify.suit, 'face', notify.face]);

    private_card_index += 1;
    $("#private_card_" + private_card_index).attr('src', get_poker(notify.face, notify.suit)).show('normal');
  });

  $.pp.reg("DRAW", function(notify) { 
    //console.log([tt(),'notify_draw', 'pid', notify.pid, 'suit', notify.suit, 'face', notify.face]);
    if (cur_pid != notify.pid) {
      var sn = get_seat_number(notify.pid)
      get_seat(sn).children('.card').css(positions[sn].card).show();
    }
  });

  $.pp.reg("SHARE", function(notify) { 
    console.log([tt(),'notify_share', 'suit', notify.suit, 'face', notify.face]);
    share_card_index += 1;
    $("#share_card_" + share_card_index).attr('src', get_poker(notify.face, notify.suit)).show('normal');
  });

  $.pp.reg("STAGE", function(notify) { 
    console.log([tt(),'notify_stage', 'stage', notify.stage]);
    if (notify.stage != 0)
      new_stage();
  });

  $.pp.reg("RAISE", function(notify) { 
    console.log([tt(),'notify_raise', 'pid', notify.pid, 'raise', notify.raise, 'call', notify.call]);

    var sum = notify.call + notify.raise;
    var sn = get_seat_number(notify.pid)
    set_betting(sn, sum);
  });

  $.pp.reg("SHOW", function(notify) { 
    console.log([tt(),'notify_show', 'pid', notify.pid, 'card1', notify.face1, notify.suit1, 'card2', notify.face2, notify.suit2]);
  });

  $.pp.reg("HAND", function(notify) { 
    console.log([tt(),'notify_hand', 'pid', notify.pid, 'rank', notify.rank, 'face', notify.face1, notify.face2]);
  });

  $.pp.reg("END", function(notify) { 
    $(".game_seat").children(".button").hide("slow");
    $(".game_seat").children(".card").hide("slow");

    pot = 0;

    $(".private_card").hide("slow");
    console.log([tt(),'----------------------notify_end----------------------']);
  });

  $.pp.reg("WIN", function(notify) { 
    console.log([tt(),'notify_win', 'pid', notify.pid, 'amount', notify.amount]);
  });

  var return_hall = function() {
    //$('#game').hide("normal");
    //$('#hall').show("normal").trigger('active', cur_game);
  };
  // }}}

  var tt = function() {
    a = new Date();
    return a.getMinutes() + ":" + a.getSeconds();
  };

  var is_disable = function() { 
    return $('#game').css('display') == 'none'; 
  };

  var convert_points = function(points) {
    return $.map(points, function(pos) {
      var c = pos.card.split(',');
      var o = pos.outer.split(',');
      var bb = pos.betting.split(',');
      var bl = pos.betting_label.split(',');

      return {
        outer: {left: o[0] + 'px', top: o[1] + 'px'},
        empty_outer: {left: o[2] + 'px', top: o[3] + 'px'},
        card : {left: c[0] + 'px', top: c[1] + 'px'},
        betting: { left: new Number(bb[2]), top: new Number(bb[3]) },
        betting_ori: { left: bb[0] + 'px', top: bb[1] + 'px' },
        betting_label: { left: bl[0] + 'px', top: bl[1] + 'px' } // 下注文字显示坐标
      };
    });
  };

  var five_positions = convert_points([
    {outer: "0,0", betting_label: "0,0", betting: "0,0,0,0", card: "0,0"},
    {outer: "435,350", betting_label: "90,-10", betting: "471,413,529,308", card: "90,30"},
    {outer: "233,350", betting_label: "65,-20", betting: "268,410,337,308", card: "90,28"},
    {outer: "117,230", betting_label: "105,5", betting: "150,288,231,203", card: "90,30"},
    {outer: "145,60", betting_label: "145,95", betting: "181,122,294,178", card: "90,40"},
    {outer: "342,20", betting_label: "50,125", betting: "376,83,389,168", card: "90,60"}
  ]);

  var nine_positions = convert_points([
    {outer: "0,0", betting_label: "0,0", betting: "0,0,0,0", card: "0,0"},
    {outer: "435,350,448,363", betting_label: "90,-10", betting: "471,413,535,314", card: "90,30"},
    {outer: "233,350,263,363", betting_label: "65,-20", betting: "268,410,309,303", card: "90,28"},
    {outer: "117,230,116,275", betting_label: "105,5", betting: "150,288,233,208", card: "90,30"},
    {outer: "145,60,173,95", betting_label: "145,95", betting: "181,122,300,175", card: "90,40"},
    {outer: "342,20,342,55", betting_label: "50,125", betting: "376,83,402,162", card: "90,60"},
    {outer: "565,20,559,55,", betting_label: "-5,125", betting: "604,84,572,162", card: "-52,60"},
    {outer: "766,60,741,95", betting_label: "-105,95", betting: "803,129,672,175", card: "-52,40"},
    {outer: "801,230,798,275", betting_label: "-63,5", betting: "832,290,749,208", card: "-51,30"},
    {outer: "680,350,640,363", betting_label: "20,-20", betting: "711,408,710,306", card: "-51,28"}
  ])
});

// vim: fdm=marker
