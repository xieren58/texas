class Game
  constructor: (@gid, @dom) ->
    return

  init: (@detail) ->
    @seats = []
    @dom.trigger 'inited'

  init_seat: (seat_detail) ->
    switch seat_detail.state
      when PS_EMPTY then @seats[seat_detail.sn] = new EmptySeat seat_detail, @
      else @seats[seat_detail.sn] = new PlayingSeat seat_detail, @

  update_seat: (seat_detail) ->
    if seat_detail.state is PS_EMPTY
      return

    seat = @get_seat seat_detail
    seat.player.set_inplay seat_detail.inplay

  reset_position: (sn)->
    $.positions.offset = $.positions.size - sn + 1
    seat.set_position() for seat in @seats when seat?

  join: (seat_detail) ->
    console.log seat_detail.sn
    @seats[seat_detail.sn].remove()
    @seats[seat_detail.sn] = new PlayingSeat seat_detail, @

    if seat_detail.pid is $.player.pid
      @hide_empty()
      @reset_position(seat_detail.sn)

  hide_empty: ->
    $("#cmd_up").attr('disabled', false).removeClass('disabled')
    seat.hide() for seat in @seats when seat? and seat.__proto__.constructor is EmptySeat

  show_empty: ->
    $("#cmd_up").attr('disabled', true).addClass('disabled')
    seat.show() for seat in @seats when seat? and seat.__proto__.constructor is EmptySeat

  leave: (args) ->
    seat = @seats[args.sn]

    if seat.__proto__.constructor is EmptySeat
      return

    @seats[seat.sn].clear()
    @seats[seat.sn].remove()
    @seats[seat.sn] = new EmptySeat {sn: args.sn}, @

    @show_empty()

  clear: ->
    $.positions.reset_share()
    $(".bet, .pot, .card").remove()
    seat.clear() for seat in @seats when seat? and seat.__proto__.constructor is PlayingSeat

  get_seat_by_pid: (o) ->
    return seat for seat in @seats when seat? and seat.__proto__.constructor is PlayingSeat and seat.player.pid is o.pid

  get_seat_by_sn: (o) ->
    return seat for seat in @seats when seat? and seat.__proto__.constructor is PlayingSeat and seat.sn is o.seat

  get_seat: (o) ->
    if 'pid' of o
      return @get_seat_by_pid(o)
    else if 'seat' of o
      return @get_seat_by_sn(o)
    else if 'sn' of o
      return @get_seat_by_sn(o)
    else
      throw "unknown object #{o} in get_seat()"

  new_stage: ->
    ref = @dom
    @dom.oneTime '0.3s', ->
      $(bet).css($.positions.get_random([240, 680], 20)).removeClass('bet').addClass('pot') for bet in ref.children(".bet")
    return

  share_card: (face, suit) ->
    $.get_poker(face, suit).
      css($.positions.get_next_share()).
      appendTo(@dom)

  win: (seat) ->
    ref = @dom
    ref.oneTime '1s', ->
      $(bet).css($.positions.get_bet(seat.sn).start) for bet in ref.children(".bet, .pot")
    return

  high: (face, suit, filter, seat_pokers) ->
    pokers = $.merge(@dom.children('.card'), seat_pokers)
    pokers = $.find_poker(face, suit, pokers)
    pokers = filter(pokers) if filter?
    pokers.addClass('high_card')

  clear_high: ->
    $.find_poker().removeClass('high_card')

  clear_actor: ->
    $('.actor_timer').remove()
    $('.actor_seat').removeClass('actor_seat')

  disable_actions: (key)->
    unless key?
      $("#game > .actions > *").attr("disabled", true).addClass('disabled')
    else
      $("#game > .actions").children("#cmd_#{key}").attr("disabled", true).addClass('disabled')

  enable_actions: ->
    $("#game > .actions > *").attr("disabled", false).removeClass('disabled')

  set_actor: (args)->
    @actor = @get_seat args
    @actor.set_actor()

  check_actor: ->
    if @actor? and @actor.player.pid is $.player.pid
      return true

    return false

  check: ->
    $.ws.send $.pp.write {cmd: "RAISE", amount: 0, gid: @gid}

  fold: ->
    $.ws.send $.pp.write {cmd: "FOLD", gid: @gid}

$ ->
  game = null
  game_dom = $('#game')
  hall_dom = $('#hall')

  game_dom.bind 'cancel_game', (event, args) ->
    game.clear()
    game = null
    $(@).hide()

  game_dom.bind 'start_game', (event, args) ->
    $("#cmd_up").attr('disabled', true).addClass('disabled')

    game = new Game args.gid, game_dom
    game.disable_actions()

    cmd = {gid: args.gid}

    $.game = game

    switch args.action
      when 'watch' then $.extend(cmd, {cmd: "WATCH"})
      when 'join' then $.extend(cmd, {cmd: "JOIN", buyin: args.buyin, seat: 0})
      else throw 'unknown game action'

    $.ws.send $.pp.write cmd

    $(@).show()
    blockUI '#msg_joining'

    $(@).oneTime '3s', ->
      # 3s timeout show network error
      blockUI '#err_network'
      return

  game_dom.bind 'inited', ->
    $(@).stopTime()
    return

  $.get_poker = (face, suit) ->
    $("<img src='#{$.rl.poker["#{new Number(face << 8 | suit)}"]}' class='card'/>").attr('face', face).attr('suit', suit)

  $.find_poker = (face, suit, pokers) ->
    return pokers.filter("[face=#{face}]").filter("[suit=#{suit}]") if face? and suit?
    return pokers.filter("[face=#{face}]") if face?
    return pokers.filter("[suit=#{suit}]") if suit?
    return $(".card")

  # {{{
  $.pp.reg "GAME_DETAIL", (detail) ->
    game.init detail
    if detail.players < 2
      growlUI "#tips_empty"
    else
      unblockUI()

  $.pp.reg "SEAT_DETAIL", (detail) ->
    game.init_seat detail

  $.pp.reg "SEAT_STATE", (detail) ->
    return unless game
    game.update_seat detail

  $.pp.reg "CANCEL", (args) ->
    growlUI "#tips_empty"

  $.pp.reg "START", (args) ->
    if $(".blockUI > .buyin").size() is 0
      unblockUI()

    game.clear()
    return

  $.pp.reg "END", (args) ->
    return

  $.pp.reg "DEALER", (args) ->
    seat = game.get_seat args
    seat.set_dealer()

  $.pp.reg "SBLIND", (args) ->
    return

  $.pp.reg "BBLIND", (args) ->
    return

  $.pp.reg "RAISE", (args) ->
    sum = args.call + args.raise
    seat = game.get_seat args

    if sum is 0
      seat.check()
    else
      seat.raise(args.call, args.raise)

  $.pp.reg "DRAW", (args) ->
    seat = game.get_seat args
    seat.draw_card()

  $.pp.reg "SHARE", (args) ->
    game.share_card(args.face, args.suit)

  $.pp.reg "PRIVATE", (args) ->
    return

  $.pp.reg "ACTOR", (args) ->
    game.set_actor(args)

  $.pp.reg "STAGE", (args) ->
    game.new_stage() if args.stage != GS_PREFLOP

  $.pp.reg "JOIN", (args) ->
    game.join args

  $.pp.reg "LEAVE", (args) ->
    seat = game.get_seat args
    game.leave seat

  $.pp.reg "BET_REQ", (args) ->
    game.enable_actions()
    game.disable_actions if args.call is 0 then 'call' else 'check'

  $.pp.reg "SHOW", (args) ->
    game.new_stage()
    seat = game.get_seat args
    seat.private_card(args.face1, args.suit1, 1)
    seat.private_card(args.face2, args.suit2, 2)

  $.pp.reg "HAND", (args) ->
    seat = game.get_seat args
    seat.set_hand args
    seat.set_rank()

  $.pp.reg "WIN", (args) ->
    game.clear_actor()
    seat = game.get_seat args
    game.win seat
    seat.high()
  # }}}

  $("#game > .actions > [id^=cmd_fold]").bind 'click', ->
    unless game.check_actor()
      return

    game.fold()

  $("#game > .actions > [id^=cmd_check]").bind 'click', ->
    unless game.check_actor()
      return

    game.check()

  $("#game > .actions > [id^=cmd_call]").bind 'click', ->
    unless game.check_actor()
      return

    return

  $("#game > .actions > [id^=cmd_raise]").bind 'click', ->
    unless game.check_actor()
      return

    return

  $("#game > .actions > [id^=cmd]").bind 'click', ->
    game.disable_actions()

  return
