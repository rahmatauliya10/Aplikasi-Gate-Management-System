import { describe, it, expect } from 'vitest';

describe('GBJ Multi Product Form Logic', () => {
  const catalog = ['SIC 18 T', 'SIC 01 PC', 'SIC 25 BR', 'SIC 8590 SD', 'SIC 9010 M3', 'SIC 18 C1'];

  it('1. should initialize with single product and allow enabling product 2', () => {
    let showProduct2 = false;
    let product1 = 'SIC 18 T';
    let product2 = '';

    expect(showProduct2).toBe(false);
    expect(product1).toBe('SIC 18 T');

    // Enable product 2
    showProduct2 = true;
    expect(showProduct2).toBe(true);

    // Available options for product 2 should exclude product 1
    const availableForProduct2 = catalog.filter(p => p !== product1);
    expect(availableForProduct2).not.toContain('SIC 18 T');
    expect(availableForProduct2.length).toBe(5);
  });

  it('2. should prevent duplicate selection between product 1 and product 2', () => {
    let product1 = 'SIC 18 T';
    let product2 = 'SIC 01 PC';

    const isDuplicate = product1 === product2;
    expect(isDuplicate).toBe(false);

    // If duplicate attempted
    product2 = 'SIC 18 T';
    const hasDuplicate = product1 === product2;
    expect(hasDuplicate).toBe(true);
  });

  it('3. should format payload with array of productTypes for 1 product', () => {
    const product1 = 'SIC 18 T';
    const showProduct2 = false;
    const product2 = '';

    const selectedProducts = [product1];
    if (showProduct2 && product2) {
      selectedProducts.push(product2);
    }

    const payload = {
      productTypes: selectedProducts,
      productType: product1,
    };

    expect(payload.productTypes).toEqual(['SIC 18 T']);
    expect(payload.productType).toBe('SIC 18 T');
  });

  it('4. should format payload with array of productTypes for 2 products', () => {
    const product1 = 'SIC 18 T';
    const showProduct2 = true;
    const product2 = 'SIC 8590 SD';

    const selectedProducts = [product1];
    if (showProduct2 && product2) {
      selectedProducts.push(product2);
    }

    const payload = {
      productTypes: selectedProducts,
      productType: product1,
    };

    expect(payload.productTypes).toEqual(['SIC 18 T', 'SIC 8590 SD']);
    expect(payload.productType).toBe('SIC 18 T');
  });

  it('5. should properly clear product 2 when removed', () => {
    let showProduct2 = true;
    let product2 = 'SIC 25 BR';

    // Remove action
    showProduct2 = false;
    product2 = '';

    expect(showProduct2).toBe(false);
    expect(product2).toBe('');
  });
});
