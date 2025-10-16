# Node.js Memory Optimization Options

This document explains the Node.js memory optimization options used in the Docker configuration.

## Current Configuration

```bash
NODE_OPTIONS=--max-old-space-size=384 --max-semi-space-size=64
```

## Option Explanations

### `--max-old-space-size=384`
- **Purpose**: Sets the maximum heap size for the old generation
- **Value**: 384MB (75% of the 512MB container limit)
- **Benefit**: Prevents Node.js from using too much memory and causing OOM kills

### `--max-semi-space-size=64`
- **Purpose**: Sets the maximum size of the semi-space in the young generation
- **Value**: 64MB
- **Benefit**: Optimizes garbage collection for better memory efficiency

## Why These Options?

1. **Memory Efficiency**: Keeps total memory usage under container limits
2. **GC Performance**: Smaller semi-space reduces GC pause times
3. **Stability**: Prevents out-of-memory crashes in Docker containers

## Common Invalid Options

❌ **Don't use these** (they will cause startup errors):
- `--gc-interval=100` - Not a valid Node.js option
- `--gc-frequency=high` - Not a valid Node.js option
- `--memory-limit=512m` - Use `--max-old-space-size` instead

## Alternative Configurations

### For Lower Memory (256MB container):
```bash
NODE_OPTIONS=--max-old-space-size=192 --max-semi-space-size=32
```

### For Higher Memory (1GB container):
```bash
NODE_OPTIONS=--max-old-space-size=768 --max-semi-space-size=128
```

### Production Optimizations:
```bash
NODE_OPTIONS=--max-old-space-size=384 --max-semi-space-size=64 --optimize-for-size
```

## Monitoring Memory Usage

Check memory usage with:
```bash
# Container stats
docker stats --no-stream

# Health check
curl http://localhost:8080/health | jq '.memory'

# Node.js process memory
docker exec -it <container> node -e "console.log(process.memoryUsage())"
```

## Troubleshooting

### "NODE_OPTIONS is not allowed" Error
- Check for invalid options like `--gc-interval`
- Use only documented Node.js flags
- Run `./fix-node-options.sh` to fix common issues

### High Memory Usage
- Reduce `--max-old-space-size` value
- Monitor with health checks
- Check for memory leaks in application code

### Frequent GC Pauses
- Adjust `--max-semi-space-size` (smaller = more frequent, shorter pauses)
- Consider `--optimize-for-size` for memory-constrained environments