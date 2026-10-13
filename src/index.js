"use strict";

module.exports = {
  ...require("./capsule"), ...require("./config"), ...require("./embeddings"), ...require("./evaluation"),
  ...require("./experiment-engine"), ...require("./memory"), ...require("./lume-core"),
  brainfuck: require("./experiments/brainfuck"), snake: require("./experiments/snake"),
  automata: require("./experiments/automata"), field: require("./experiments/field"), reflection: require("./experiments/reflection")
};
