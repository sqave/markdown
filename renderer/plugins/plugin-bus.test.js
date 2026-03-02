import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginBus } from './plugin-bus.js';

describe('PluginBus', () => {
  let bus;

  beforeEach(() => {
    bus = new PluginBus();
  });

  it('on + emit — listener receives data', () => {
    const fn = vi.fn();
    bus.on('test', fn);
    bus.emit('test', { value: 42 });
    expect(fn).toHaveBeenCalledWith({ value: 42 });
  });

  it('off — removed listener stops firing', () => {
    const fn = vi.fn();
    bus.on('test', fn);
    bus.off('test', fn);
    bus.emit('test', 'data');
    expect(fn).not.toHaveBeenCalled();
  });

  it('multiple listeners on same event all fire', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    bus.on('test', fn1);
    bus.on('test', fn2);
    bus.emit('test', 'hello');
    expect(fn1).toHaveBeenCalledWith('hello');
    expect(fn2).toHaveBeenCalledWith('hello');
  });

  it('emit with no listeners — no crash', () => {
    expect(() => bus.emit('nonexistent', 'data')).not.toThrow();
  });

  it('plugin-scoped tracking — on(event, fn, pluginId) registers under pluginId', () => {
    const fn = vi.fn();
    bus.on('test', fn, 'my-plugin');
    bus.emit('test', 'data');
    expect(fn).toHaveBeenCalledWith('data');
  });

  it('removeAllForPlugin — removes only that plugin\'s listeners, leaves others', () => {
    const pluginFn = vi.fn();
    const otherFn = vi.fn();
    bus.on('test', pluginFn, 'plugin-a');
    bus.on('test', otherFn, 'plugin-b');

    bus.removeAllForPlugin('plugin-a');
    bus.emit('test', 'data');

    expect(pluginFn).not.toHaveBeenCalled();
    expect(otherFn).toHaveBeenCalledWith('data');
  });

  it('listenerCount — accurate after add/remove', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    expect(bus.listenerCount).toBe(0);

    bus.on('a', fn1);
    bus.on('b', fn2);
    expect(bus.listenerCount).toBe(2);

    bus.off('a', fn1);
    expect(bus.listenerCount).toBe(1);
  });

  it('error isolation — one listener throwing doesn\'t prevent others from firing', () => {
    const badFn = vi.fn(() => { throw new Error('boom'); });
    const goodFn = vi.fn();
    bus.on('test', badFn);
    bus.on('test', goodFn);

    bus.emit('test', 'data');

    expect(badFn).toHaveBeenCalled();
    expect(goodFn).toHaveBeenCalledWith('data');
  });

  it('off for non-existent event — no crash', () => {
    const fn = vi.fn();
    expect(() => bus.off('nonexistent', fn)).not.toThrow();
  });
});
