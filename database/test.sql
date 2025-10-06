CREATE TABLE IF NOT EXISTS energy_readings (
    id CHAR(36) PRIMARY KEY DEFAULT (uuid()),
    meter_id CHAR(36),
    timestamp DATETIME NOT NULL,

    -- Voltage measurements
    voltage_v1n DECIMAL(10,3),
    voltage_v2n DECIMAL(10,3),
    voltage_v3n DECIMAL(10,3),
    avg_voltage_ln DECIMAL(10,3),
    voltage_v12 DECIMAL(10,3),
    voltage_v23 DECIMAL(10,3),
    voltage_v31 DECIMAL(10,3),
    avg_voltage_ll DECIMAL(10,3),

    -- Current measurements
    current_i1 DECIMAL(10,3),
    current_i2 DECIMAL(10,3),
    current_i3 DECIMAL(10,3),
    avg_current DECIMAL(10,3),

    -- Power measurements
    kw1 DECIMAL(10,3),
    kw2 DECIMAL(10,3),
    kw3 DECIMAL(10,3),
    kva1 DECIMAL(10,3),
    kva2 DECIMAL(10,3),
    kva3 DECIMAL(10,3),
    kvar1 DECIMAL(10,3),
    kvar2 DECIMAL(10,3),
    kvar3 DECIMAL(10,3),
    total_kw DECIMAL(10,3),
    total_kva DECIMAL(10,3),
    total_kvar DECIMAL(10,3),

    -- Power Factor
    pf1 DECIMAL(6,3),
    pf2 DECIMAL(6,3),
    pf3 DECIMAL(6,3),
    avg_pf DECIMAL(6,3),

    -- Frequency
    frequency DECIMAL(6,3),

    -- Energy Accumulation
    kwh DECIMAL(15,3),
    kvah DECIMAL(15,3),
    kvarh DECIMAL(15,3),
    
    -- Foreign key
    FOREIGN KEY (meter_id) REFERENCES meters(id)
);
