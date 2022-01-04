# ms-template

Microservice template

Just before to start, tart the docker-compose `docker-compose up -d`

Create the 2 databases (the `ms_template_dev` should be already present):

```
$ docker exec -it ms-template-db /bin/bash -c "createdb -U postgres ms_template_dev"
$ docker exec -it ms-template-db /bin/bash -c "createdb -U postgres ms_template_test"
```

## Run Test

Run tests:

```
$ npm run test
```

You should see something like this:

```

> ms-template@1.0.0 test
> mocha test



> Migrating files:
> - 1636137304939_add-user-table
### MIGRATION 1636137304939_add-user-table (UP) ###
  GET /
Running in  test
No migrations to run!
    ✔ should return 200 OK

  status controller
    ✔ return 200 for /healthz
    ✔ return 200 and db stats
    ✔ return 200 and db rabbit info


  4 passing (303ms)

```

## Running locally

If you want to simply start the server you can:

```
$ npm run build && npm start
```

If you want to start the server in debug and watching mode:

```
$ npm run debug
```

## How to generate a new migration

Suppose you have to create a migration to add a new field in a table you can execute this file:

```
$ npm run create-migration add field to a table
```

and a file called `1637739601040_add-field-to-a-table.js` (the number will be different) will be created in the folder `migration`.

When you run the test or the project the migrations are executed automatically but iy you want to run manually you have to execute this command:

```
$ DATABASE_URL=postgres://postgres:postgres@localhost:5432/ms_template_dev npm run migrate up
```

If you want to recreate your db you can execute these commands:

```
$ docker exec -it ms-template-db /bin/bash -c "dropdb -U postgres ms_template_dev"
$ docker exec -it ms-template-db /bin/bash -c "createdb -U postgres ms_template_dev"
```

## How to dump a new sql-schema

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ms_template_dev npm run dump-structure
```

this command will run the migration before to dump the structure.

