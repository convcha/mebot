// Rooms -- {name: String}
Rooms = new Meteor.Collection("rooms");

// Publish complete set of rooms to all clients.
Meteor.publish('rooms', function () {
  return Rooms.find();
});


// Comments -- {text: String,
//           done: Boolean,
//           tags: [String, ...],
//           room_id: String,
//           timestamp: Number}
Comments = new Meteor.Collection("comments");

// Publish all items for requested room_id.
Meteor.publish('comments', function (room_id) {
  check(room_id, String);
  return Comments.find({room_id: room_id});
});

