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

By default the logs are suppressed in test, but you can activate in this way:

```shell
SILENT_LOG=FALSE npm run test
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

## Scheduled Job

In docker-compose there is a scheduled task that call `/healtz` every 30 seconds. See [ofelia](https://github.com/mcuadros/ofelia) on github for more info.

## Observability

## Tracing

To see the application tracing we use Jaeger: <https://www.jaegertracing.io/>

Start the application with

```
npm run trace
```

Open <http://localhost:16686/> to see the Jaeger console

## Metrics

You can see the metrics you are exporting going here: <http://localhost:3000/metrics>. You can see the metrics on Prometheus here: <http://localhost:9090/metrics>. At the end you can see the metrics on Grafana going here: <http://localhost:3333/>. Credentials: `admin admin`.

Some queries could be:

```
increase(created_users[10m])
created_users
```
