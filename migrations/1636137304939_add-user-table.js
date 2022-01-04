/* eslint-disable camelcase */

exports.shorthands = undefined

/**
 * @param {import("node-pg-migrate").MigrationBuilder} pgm
 */
exports.up = function (pgm) {
  pgm.createTable("users", {
    id: { type: "uuid", primaryKey: true, notNull: true },
    email: { type: "string", notNull: true, unique: true },
    date_of_birth: { type: "date", notNull: false },
    confirmed_at: { type: "timestamp", notNull: false },
    first_name: { type: "string", notNull: true },
    last_name: { type: "string", notNull: true },
    version: { type: "integer", notNull: true },
    updated_at: { type: "timestamp", notNull: true, default: pgm.func("current_timestamp") },
    created_at: { type: "timestamp", notNull: true, default: pgm.func("current_timestamp") },
  })

  pgm.createFunction(
    "trigger_set_updated_at",
    [],
    {
      language: "plpgsql",
      returns: "TRIGGER",
    },
    `
  BEGIN
    new.updated_at = now();
    return new;
  END;
    `
  )
  pgm.createTrigger("users", "set_timestamp", {
    when: "BEFORE",
    operation: "update",
    level: "ROW",
    function: "trigger_set_updated_at",
  })
}
