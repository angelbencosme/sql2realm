#!/usr/bin/env node
const cliProgress = require("cli-progress");
const figlet = require("figlet");
const chalk = require("chalk");
require("pretty-error").start();
const logger = require("./src/logger");
const { config, argv } = require("./src/loadconfig");
const mysql = require("./src/mysql");
const Realm = require("./src/realm");
const { getLastId, getSchemas } = require("./src/utils");
const { convert } = require("./src/convert");

const bar1 = new cliProgress.Bar({}, cliProgress.Presets.shades_classic);

const intro = () => {
  console.log(
    chalk.green(
      figlet.textSync("Mysql to Realm", {
        font: "Small",
        horizontalLayout: "default",
        verticalLayout: "default"
      })
    )
  );
};

(async function main() {
  intro();
  logger.debug("connecting to mysql");
  const connection = await mysql.init(config.mysql);

  const tableNames = Object.keys(config.tables || {});
  logger.debug("erasing old Realm");
  Realm.erase(config.realm);

  for (let ii = 0; ii < tableNames.length; ii += 1) {
    const tableName = tableNames[ii];

    if (!argv.skip.includes(tableName)) {
      logger.log(chalk.green(`Converting table: ${tableName}`));
      const table = config.tables[tableName];
      const { schema, convert: convertRules, filter: filterRule } = table;

      if (schema) {
        const schemas = getSchemas(config.tables, schema);
        // logger.debug(schemas);
        const realm = await Realm.init(config.realm, schemas);

        const count = await mysql.getCount(tableName, filterRule);

        const pages = Math.ceil(count / argv.chunk);
        bar1.start(pages - 1);

        let lastID = -1;
        for (let i = 0; i < pages; i += 1) {
          bar1.update(i);

          const results = await mysql.getTableChunk(
            tableName,
            filterRule,
            argv.chunk,
            lastID
          );
          lastID = getLastId(results);

          // write by chunks
          realm.write(() => {
            results.forEach(element => {
              const newElement = convert(element, convertRules);
              // console.log(newElement);
              // process.exit();
              realm.create(schema.name, newElement);
            });
          });
        }
        bar1.stop();
        realm.close();
      }
    }
  }

  connection.end();
  process.exit();
})();
