"use strict";

module.exports = {
  ...require("./capsule"), ...require("./config"), ...require("./embeddings"), ...require("./evaluation"),
  ...require("./experiment-engine"), ...require("./memory"), ...require("./lume-core"),
  evolution: {
    ...require("./evolution/contracts"), ...require("./evolution/fitness"),
    ...require("./evolution/compiler"), ...require("./evolution/provenance"),
    ...require("./evolution/canary"), ...require("./evolution/canary-evaluator")
  },
  brainfuck: require("./experiments/brainfuck"), snake: require("./experiments/snake"),
  automata: require("./experiments/automata"), field: require("./experiments/field"), reflection: require("./experiments/reflection")
};
