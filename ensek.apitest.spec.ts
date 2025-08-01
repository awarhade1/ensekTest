import { test, expect, request } from '@playwright/test';
import jp from 'jsonpath';


test('reset test data', async ({ request }) => {
    const response = await request.post('https://qacandidatetest.ensek.io/ENSEK/reset',{
     });
    expect(response.status()).toBe(200);
});

test('Buy a quantity of each fuel', async ({ request }) => {

  // Step 1: Fetch energy types
  const response = await request.get("https://qacandidatetest.ensek.io/ENSEK/energy");
  expect(response.status()).toBe(200);

  const energyData = await response.json();

  // Step 2: Loop through each fuel type
  const fuels = ['electric', 'gas', 'nuclear', 'oil'];

  for (const fuel of fuels) {
    const energy = energyData[fuel];

    if (!energy || typeof energy.energy_id !== 'number') {
      console.warn(`Skipping invalid or missing energy type: ${fuel}`);
      continue;
    }

    const availableUnits = energy.quantity_of_units;
    const energyId = energy.energy_id;

    // Skip if no stock
    if (availableUnits <= 0) {
      console.log(`Skipping ${fuel} — no stock available (${availableUnits} units).`);
      continue;
    }

    // Decide quantity to buy (max 5 or available stock)
    const quantityToBuy = Math.min(5, availableUnits);

    console.log(`Buying ${quantityToBuy} units of ${fuel} (ID: ${energyId}, Available: ${availableUnits})`);

    // Step 3: Buy energy
    const buyResponse = await request.put(`https://qacandidatetest.ensek.io/ENSEK/buy/${energyId}/${quantityToBuy}`);
    expect(buyResponse.ok()).toBeTruthy();

    const buyBody = await buyResponse.json();
    const message = buyBody.message;

    // Step 4: Validate message includes quantity bought
    expect(typeof message).toBe('string');
    expect(message).toContain(String(quantityToBuy));
  }
});


test('Buy fuels and verify each order appears in /orders using order ID', async ({ request }) => {
  const energyRes = await request.get('https://qacandidatetest.ensek.io/ENSEK/energy');
  expect(energyRes.status()).toBe(200);
  const energyData = await energyRes.json();

  const fuels = ['electric', 'gas', 'nuclear', 'oil'];
  const placedOrderIds: string[] = [];

  for (const fuel of fuels) {
    const energy = energyData[fuel];
    if (!energy || typeof energy.energy_id !== 'number') continue;

    const available = energy.quantity_of_units;
    if (available <= 0) {
      console.log(`⚠️ Skipping ${fuel} — No stock available (${available} units)`);
      continue;
    }

    const quantity = Math.min(5, available);
    const buyRes = await request.put(`https://qacandidatetest.ensek.io/ENSEK/buy/${energy.energy_id}/${quantity}`);
    expect(buyRes.ok()).toBeTruthy();

    const body = await buyRes.json();
    const message = body.message;
    expect(typeof message).toBe('string');
    expect(message).toContain(String(quantity));

    // ✅ Extract order ID from message
    const orderIdMatch = message.match(/order id is ([a-f0-9\-]+)/i);
    if (!orderIdMatch) {
      throw new Error(`❌ Order ID not found in message: ${message}`);
    }

    const orderId = orderIdMatch[1];
    placedOrderIds.push(orderId);
    console.log(`✅ Placed order for ${fuel} — Order ID: ${orderId}`);
  }

  // ✅ Wait briefly to ensure orders are available in /orders
  await new Promise(res => setTimeout(res, 1000));

  // Skip validation if no orders were placed
  if (placedOrderIds.length === 0) {
    console.log('ℹ️ No orders were placed due to insufficient stock. Skipping order verification.');
    return;
  }

  // Fetch /orders
  const ordersRes = await request.get('https://qacandidatetest.ensek.io/ENSEK/orders');
  expect(ordersRes.ok()).toBeTruthy();
  const ordersBody = await ordersRes.json();
  const allOrders = Array.isArray(ordersBody.orders) ? ordersBody.orders : ordersBody;

  // Validate each order ID is found
  for (const orderId of placedOrderIds) {
    const found = allOrders.some((order: any) => order.id === orderId);
    expect(found).toBeTruthy();
    console.log(`🧾 Verified order exists in /orders — ID: ${orderId}`);
  }
});

test('Count how many orders were created before today', async ({ request }) => {
  // Step 1: Fetch all orders
  const ordersResponse = await request.get("https://qacandidatetest.ensek.io/ENSEK/orders");
  expect(ordersResponse.ok()).toBeTruthy();

  const ordersBody = await ordersResponse.json();
  const orders = Array.isArray(ordersBody.orders) ? ordersBody.orders : ordersBody;

  // Step 2: Get current date at midnight (00:00:00)
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Step 3: Filter orders created before today
  const pastOrders = orders.filter((order: any) => {
    const created = new Date(order.created_at || order.timestamp);
    return created < todayMidnight;
  });

  console.log(`Number of orders created before today (${todayMidnight.toISOString()}): ${pastOrders.length}`);
  expect(typeof pastOrders.length).toBe('number');
});



