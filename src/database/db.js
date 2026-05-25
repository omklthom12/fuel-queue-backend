const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const env = require('../config/env');

let dbPromise;

async function getDb() {
  if (!dbPromise) {
    fs.mkdirSync(path.dirname(env.dbPath), { recursive: true });
    dbPromise = open({ filename: env.dbPath, driver: sqlite3.Database });
    const db = await dbPromise;
    await db.exec('PRAGMA foreign_keys = ON');
    await migrate(db);
  }
  return dbPromise;
}

async function migrate(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT UNIQUE,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','station_manager','employee','driver')) DEFAULT 'driver',
      station_id INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      city TEXT NOT NULL,
      address TEXT,
      latitude REAL,
      longitude REAL,
      status TEXT NOT NULL CHECK(status IN ('open','closed','busy','no_fuel')) DEFAULT 'open',
      working_hours TEXT DEFAULT '24/7',
      manager_user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(manager_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS fuel_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL UNIQUE,
      unit_price REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS station_fuel (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      station_id INTEGER NOT NULL,
      fuel_type_id INTEGER NOT NULL,
      quantity_liters REAL NOT NULL DEFAULT 0,
      low_stock_threshold REAL NOT NULL DEFAULT 500,
      is_available INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(station_id, fuel_type_id),
      FOREIGN KEY(station_id) REFERENCES stations(id) ON DELETE CASCADE,
      FOREIGN KEY(fuel_type_id) REFERENCES fuel_types(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pumps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      station_id INTEGER NOT NULL,
      fuel_type_id INTEGER NOT NULL,
      pump_number TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('available','busy','maintenance','closed')) DEFAULT 'available',
      current_booking_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(station_id) REFERENCES stations(id) ON DELETE CASCADE,
      FOREIGN KEY(fuel_type_id) REFERENCES fuel_types(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      driver_user_id INTEGER NOT NULL,
      station_id INTEGER NOT NULL,
      fuel_type_id INTEGER NOT NULL,
      queue_number INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('waiting','called','serving','completed','cancelled','missed')) DEFAULT 'waiting',
      estimated_wait_minutes INTEGER NOT NULL DEFAULT 0,
      requested_liters REAL,
      vehicle_plate TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      called_at TEXT,
      service_started_at TEXT,
      completed_at TEXT,
      cancelled_at TEXT,
      FOREIGN KEY(driver_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(station_id) REFERENCES stations(id) ON DELETE CASCADE,
      FOREIGN KEY(fuel_type_id) REFERENCES fuel_types(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS queue_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      old_status TEXT,
      new_status TEXT NOT NULL,
      actor_user_id INTEGER,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'general',
      is_read INTEGER NOT NULL DEFAULT 0,
      booking_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plate_number TEXT NOT NULL,
      vehicle_type TEXT DEFAULT 'سيارة',
      color TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS favorite_stations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      station_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, station_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(station_id) REFERENCES stations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS station_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      station_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      comment TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(station_id) REFERENCES stations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('open','in_progress','closed')) DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS issue_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      station_id INTEGER,
      report_type TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('new','reviewed','resolved')) DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(station_id) REFERENCES stations(id) ON DELETE SET NULL
    );

  `);
}

module.exports = { getDb };
