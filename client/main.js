// Client-side JavaScript, bundled and sent to client.

// Define Minimongo collections to match server/publish.js.
Rooms = new Meteor.Collection("rooms");
Comments = new Meteor.Collection("comments");

// ID of currently selected room
Session.setDefault('room_id', null);

// Name of currently selected tag for filtering
Session.setDefault('tag_filter', null);

// When adding tag to a comment, ID of the comment
Session.setDefault('editing_addtag', null);

// When editing a room name, ID of the room
Session.setDefault('editing_roomname', null);

// When editing comment text, ID of the comment
Session.setDefault('editing_itemname', null);

// Subscribe to 'rooms' collection on startup.
// Select a room once data has arrived.
var roomsHandle = Meteor.subscribe('rooms', function () {
  if (!Session.get('room_id')) {
    var room = Rooms.findOne({}, {sort: {name: 1}});
    if (room)
      Router.setRoom(room._id);
  }
});

var commentsHandle = null;
// Always be subscribed to the comments for the selected room.
Deps.autorun(function () {
  var room_id = Session.get('room_id');
  if (room_id)
    commentsHandle = Meteor.subscribe('comments', room_id);
  else
    commentsHandle = null;
});


////////// Helpers for in-place editing //////////

// Returns an event map that handles the "escape" and "return" keys and
// "blur" events on a text input (given by selector) and interprets them
// as "ok" or "cancel".
var okCancelEvents = function (selector, callbacks) {
  var ok = callbacks.ok || function () {};
  var cancel = callbacks.cancel || function () {};

  var events = {};
  events['keyup '+selector+', keydown '+selector+', focusout '+selector] =
    function (evt) {
      if (evt.type === "keydown" && evt.which === 27) {
        // escape = cancel
        cancel.call(this, evt);

      } else if (evt.type === "keyup" && evt.which === 13 ||
                 evt.type === "focusout") {
        // blur/return/enter = ok/submit if non-empty
        var value = String(evt.target.value || "");
        if (value)
          ok.call(this, value, evt);
        else
          cancel.call(this, evt);
      }
    };

  return events;
};

var activateInput = function (input) {
  input.focus();
  input.select();
};

////////// Rooms //////////

Template.rooms.loading = function () {
  return !roomsHandle.ready();
};

Template.rooms.rooms = function () {
  return Rooms.find({}, {sort: {name: 1}});
};

Template.rooms.events({
  'mousedown .room': function (evt) { // select room
    Router.setRoom(this._id);
  },
  'click .room': function (evt) {
    // prevent clicks on <a> from refreshing the page.
    evt.preventDefault();
  },
  'dblclick .room': function (evt, tmpl) { // start editing room name
    Session.set('editing_roomname', this._id);
    Deps.flush(); // force DOM redraw, so we can focus the edit field
    activateInput(tmpl.find("#room-name-input"));
  },
  'click .destroy': function () {
    Rooms.remove(this._id);
    var items = Comments.find({room_id: this._id});
    items.forEach(function (item){
      Comments.remove(item._id);
    });
    Session.set('room_id', null);
    Router.setRoom(null);
  }
});

// Attach events to keydown, keyup, and blur on "New room" input box.
Template.rooms.events(okCancelEvents(
  '#new-room',
  {
    ok: function (text, evt) {
      var id = Rooms.insert({name: text});
      Router.setRoom(id);
      evt.target.value = "";
    }
  }));

Template.rooms.events(okCancelEvents(
  '#room-name-input',
  {
    ok: function (value) {
      Rooms.update(this._id, {$set: {name: value}});
      Session.set('editing_roomname', null);
    },
    cancel: function () {
      Session.set('editing_roomname', null);
    }
  }));

Template.rooms.selected = function () {
  return Session.equals('room_id', this._id) ? 'selected' : '';
};

Template.rooms.can_destroy = function () {
  return Meteor.user() && Session.equals('room_id', this._id);
}

Template.rooms.name_class = function () {
  return this.name ? '' : 'empty';
};

Template.rooms.editing = function () {
  return Session.equals('editing_roomname', this._id);
};

////////// Comments //////////

Template.comments.loading = function () {
  return commentsHandle && !commentsHandle.ready();
};

Template.comments.any_room_selected = function () {
  return !Session.equals('room_id', null);
};

Template.comments.events(okCancelEvents(
  '#new-comment',
  {
    ok: function (text, evt) {
      var tag = Session.get('tag_filter');
      Comments.insert({
        text: text,
        room_id: Session.get('room_id'),
        done: false,
        timestamp: (new Date()).getTime(),
        tags: tag ? [tag] : [],
        owner: Meteor.user()._id,
        owner_name: Meteor.user().emails[0].address.split('@')[0]
      });
      evt.target.value = '';
    }
  }));

Template.comments.comments = function () {
  // Determine which comments to display in main pane,
  // selected based on room_id and tag_filter.

  var room_id = Session.get('room_id');
  if (!room_id)
    return {};

  var sel = {room_id: room_id};
  var tag_filter = Session.get('tag_filter');
  if (tag_filter)
    sel.tags = tag_filter;

  return Comments.find(sel, {sort: {timestamp: -1}});
};

Template.comment_item.tag_objs = function () {
  var comment_id = this._id;
  return _.map(this.tags || [], function (tag) {
    return {comment_id: comment_id, tag: tag};
  });
};

Template.comment_item.done_class = function () {
  return this.done ? 'done' : '';
};

Template.comment_item.editing = function () {
  return Session.equals('editing_itemname', this._id);
};

Template.comment_item.adding_tag = function () {
  return Session.equals('editing_addtag', this._id);
};

Template.comment_item.helpers ({
  created: function () {
    var time = moment (this.timestamp);
    return time.format ('H:mm');
  },
  displayName: function () {
    if(Meteor.user()){
      return Meteor.users.findOne(Meteor.userId).emails[0].address.split('@')[0];
    }else{
      return '';
    }
  }
});

Template.comment_item.events({
  'click .addtag': function (evt, tmpl) {
    Session.set('editing_addtag', this._id);
    Deps.flush(); // update DOM before focus
    activateInput(tmpl.find("#edittag-input"));
  },

  'dblclick .display .comment-text': function (evt, tmpl) {
    Session.set('editing_itemname', this._id);
    Deps.flush(); // update DOM before focus
    activateInput(tmpl.find("#comment-input"));
  },

  'click .remove': function (evt) {
    var tag = this.tag;
    var id = this.comment_id;

    evt.target.parentNode.style.opacity = 0;
    // wait for CSS animation to finish
    Meteor.setTimeout(function () {
      Comments.update({_id: id}, {$pull: {tags: tag}});
    }, 300);
  }
});

Template.comment_item.events(okCancelEvents(
  '#comment-input',
  {
    ok: function (value) {
      Comments.update(this._id, {$set: {text: value}});
      Session.set('editing_itemname', null);
    },
    cancel: function () {
      Session.set('editing_itemname', null);
    }
  }));

Template.comment_item.events(okCancelEvents(
  '#edittag-input',
  {
    ok: function (value) {
      Comments.update(this._id, {$addToSet: {tags: value}});
      Session.set('editing_addtag', null);
    },
    cancel: function () {
      Session.set('editing_addtag', null);
    }
  }));

////////// Tag Filter //////////

// Pick out the unique tags from all comments in current room.
Template.tag_filter.tags = function () {
  var tag_infos = [];
  var total_count = 0;

  Comments.find({room_id: Session.get('room_id')}).forEach(function (comment) {
    _.each(comment.tags, function (tag) {
      var tag_info = _.find(tag_infos, function (x) { return x.tag === tag; });
      if (! tag_info)
        tag_infos.push({tag: tag, count: 1});
      else
        tag_info.count++;
    });
    total_count++;
  });

  tag_infos = _.sortBy(tag_infos, function (x) { return x.tag; });
  tag_infos.unshift({tag: null, count: total_count});

  return tag_infos;
};

Template.tag_filter.tag_text = function () {
  return this.tag || "All items";
};

Template.tag_filter.selected = function () {
  return Session.equals('tag_filter', this.tag) ? 'selected' : '';
};

Template.tag_filter.events({
  'mousedown .tag': function () {
    if (Session.equals('tag_filter', this.tag))
      Session.set('tag_filter', null);
    else
      Session.set('tag_filter', this.tag);
  }
});

////////// Tracking selected room in URL //////////

var CommentsRouter = Backbone.Router.extend({
  routes: {
    ":room_id": "main"
  },
  main: function (room_id) {
    var oldRoom = Session.get("room_id");
    if (oldRoom !== room_id) {
      Session.set("room_id", room_id);
      Session.set("tag_filter", null);
    }
  },
  setRoom: function (room_id) {
    this.navigate(room_id, true);
  }
});

Router = new CommentsRouter;

Meteor.startup(function () {
  Backbone.history.start({pushState: true});
});
