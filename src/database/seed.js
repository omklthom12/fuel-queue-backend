const bcrypt = require('bcryptjs');
const { getDb } = require('./db');

async function upsertUser(db, user) {
  const passwordHash = await bcrypt.hash(user.password, 10);
  await db.run(`
    INSERT INTO users (name, phone, email, password_hash, role, station_id)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(phone) DO UPDATE SET
      name = excluded.name,
      email = excluded.email,
      password_hash = excluded.password_hash,
      role = excluded.role,
      station_id = excluded.station_id,
      updated_at = CURRENT_TIMESTAMP
  `, [user.name, user.phone, user.email, passwordHash, user.role, user.station_id || null]);
  return db.get('SELECT * FROM users WHERE phone = ?', [user.phone]);
}

async function main() {
  const db = await getDb();
  await db.exec('BEGIN TRANSACTION');
  try {
    await db.run(`INSERT OR IGNORE INTO fuel_types (name, code, unit_price) VALUES ('بنزين', 'PETROL', 1.00)`);
    await db.run(`INSERT OR IGNORE INTO fuel_types (name, code, unit_price) VALUES ('ديزل', 'DIESEL', 0.80)`);
    await db.run(`INSERT OR IGNORE INTO fuel_types (name, code, unit_price) VALUES ('غاز', 'GAS', 0.60)`);

    await db.run(`
      INSERT OR IGNORE INTO stations (id, name, city, address, latitude, longitude, status, working_hours)
      VALUES (1, 'محطة سيئون المركزية', 'سيئون', 'شارع المطار - سيئون', 15.9430, 48.7873, 'open', '24/7')
    `);
    await db.run(`
      INSERT OR IGNORE INTO stations (id, name, city, address, latitude, longitude, status, working_hours)
      VALUES (2, 'محطة حضرموت الحديثة', 'سيئون', 'الخط العام - حضرموت', 15.9485, 48.7800, 'busy', '06:00 - 23:00')
    `);
    await db.run(`
      INSERT OR IGNORE INTO stations (id, name, city, address, latitude, longitude, status, working_hours)
      VALUES (3, 'محطة الوادي', 'تريم', 'مدخل تريم الغربي', 16.0569, 48.9980, 'open', '24/7')
    `);

    const fuelTypes = await db.all('SELECT id, code FROM fuel_types');
    const initialFuel = {
      PETROL: [4500, 2800, 3500],
      DIESEL: [6000, 2500, 3900],
      GAS: [1500, 1000, 800],
    };
    for (const ft of fuelTypes) {
      for (const stationId of [1, 2, 3]) {
        await db.run(`
          INSERT OR IGNORE INTO station_fuel (station_id, fuel_type_id, quantity_liters, low_stock_threshold, is_available)
          VALUES (?, ?, ?, 500, 1)
        `, [stationId, ft.id, initialFuel[ft.code][stationId - 1] || 0]);
        await db.run(`
          INSERT OR IGNORE INTO pumps (station_id, fuel_type_id, pump_number, status)
          VALUES (?, ?, ?, 'available')
        `, [stationId, ft.id, `${ft.code}-${stationId}-1`]);
      }
    }

    const admin = await upsertUser(db, {
      name: 'مدير النظام', phone: '700000001', email: 'admin@fuel.local', password: '123456', role: 'admin'
    });
    const manager = await upsertUser(db, {
      name: 'مدير محطة سيئون', phone: '700000002', email: 'manager@fuel.local', password: '123456', role: 'station_manager', station_id: 1
    });
    await upsertUser(db, {
      name: 'موظف خدمة', phone: '700000003', email: 'employee@fuel.local', password: '123456', role: 'employee', station_id: 1
    });
    const driver = await upsertUser(db, {
      name: 'سائق تجريبي', phone: '700000004', email: 'driver@fuel.local', password: '123456', role: 'driver'
    });

    await db.run('UPDATE stations SET manager_user_id = ? WHERE id = 1', [manager.id]);

    const petrol = await db.get("SELECT id FROM fuel_types WHERE code = 'PETROL'");
    const existingBooking = await db.get('SELECT id FROM bookings WHERE driver_user_id = ? AND status IN (\'waiting\',\'called\',\'serving\')', [driver.id]);
    if (!existingBooking) {
      const result = await db.run(`
        INSERT INTO bookings (driver_user_id, station_id, fuel_type_id, queue_number, status, estimated_wait_minutes, requested_liters, vehicle_plate)
        VALUES (?, 1, ?, 1, 'waiting', 6, 40, 'س ي ن 1234')
      `, [driver.id, petrol.id]);
      await db.run(`INSERT INTO queue_events (booking_id, new_status, actor_user_id, note) VALUES (?, 'waiting', ?, 'حجز تجريبي')`, [result.lastID, driver.id]);
      await db.run(`INSERT INTO notifications (user_id, title, body, type, booking_id) VALUES (?, 'تم حجز دورك', 'رقم دورك التجريبي هو 1', 'booking', ?)`, [driver.id, result.lastID]);
    }


    await db.run(`INSERT OR IGNORE INTO vehicles (id, user_id, plate_number, vehicle_type, color, is_default) VALUES (1, ?, 'س ي ن 1234', 'سيارة خاصة', 'أبيض', 1)`, [driver.id]);
    await db.run(`INSERT OR IGNORE INTO favorite_stations (user_id, station_id) VALUES (?, 1)`, [driver.id]);
    await db.run(`INSERT OR IGNORE INTO station_reviews (id, user_id, station_id, rating, comment) VALUES (1, ?, 1, 5, 'الخدمة منظمة والحجز واضح وسريع')`, [driver.id]);
    await db.run(`INSERT OR IGNORE INTO support_tickets (id, user_id, subject, message, status) VALUES (1, ?, 'استفسار عن الحجز', 'كيف أعرف أن دوري اقترب؟', 'open')`, [driver.id]);

    await db.exec('COMMIT');
    console.log('✅ Database seeded successfully');
    console.log('Admin:   phone=700000001 password=123456');
    console.log('Manager: phone=700000002 password=123456');
    console.log('Employee:phone=700000003 password=123456');
    console.log('Driver:  phone=700000004 password=123456');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
