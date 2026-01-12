# Troubleshooting Guide

## Common Issues

### Names Still Misspelled

**Problem**: Whisper keeps mishearing names even after adding context.

**Solution**: Add phonetic aliases to your context files:

```yaml
# ~/.protokoll/people/priya-sharma.yaml
id: priya-sharma
name: Priya Sharma
sounds_like:
  - "pre a"
  - "pria"
  - "preeya sharma"
  - "preya"
```

The `sounds_like` field helps Protokoll recognize common mishearings.

### Notes Going to Wrong Directory

**Problem**: Notes about Project A are going to default directory.

**Solution**: Check your triggers in config:

```yaml
routing:
  projects:
    - projectId: "projectA"
      triggers:
        - "project a"       # Case insensitive
        - "projecta"        # No space version
        - "this is about project a"
        - "project alpha"   # Alternative names
```

Also check that your project context file exists:

```yaml
# ~/.protokoll/projects/project-a.yaml
id: project-a
name: Project A
triggers:
  - "project a"
  - "project alpha"
active: true
```

### Slow Processing

**Problem**: Each file takes too long.

**Solutions**:

1. Use a faster model:
```bash
protokoll --model gpt-4o-mini --input-directory ./recordings
```

2. Check your audio file sizes - large files take longer to transcribe.

3. Review self-reflection reports to identify bottlenecks:
```bash
protokoll --self-reflection --input-directory ./recordings
cat output/protokoll/*-reflection.md
```

### API Rate Limits

**Problem**: Getting rate limit errors.

**Solutions**:

1. Use batch mode with fewer concurrent requests:
```bash
protokoll --batch --input-directory ./recordings
```

2. Process files one at a time:
```bash
for f in ./recordings/*.m4a; do
  protokoll --input-directory "$(dirname "$f")" --file "$(basename "$f")"
  sleep 2
done
```

### Context Not Found

**Problem**: Protokoll isn't finding your context files.

**Solution**: Check the context directory structure:

```
~/.protokoll/
├── config.yaml
├── people/
│   └── *.yaml
├── projects/
│   └── *.yaml
├── companies/
│   └── *.yaml
└── terms/
    └── *.yaml
```

Run with verbose mode to see context discovery:
```bash
protokoll --verbose --input-directory ./recordings
```

### Audio File Not Supported

**Problem**: Protokoll skips certain audio files.

**Solution**: Check supported formats:
- mp3
- mp4
- mpeg
- mpga
- m4a
- wav
- webm

Convert unsupported formats:
```bash
ffmpeg -i input.ogg -acodec libmp3lame output.mp3
```

### Large Audio Files Fail

**Problem**: Files over 25MB fail to process.

**Solution**: Protokoll automatically splits large files. If this fails:

1. Check you have ffmpeg installed:
```bash
ffmpeg -version
```

2. Manually split large files:
```bash
ffmpeg -i large-file.m4a -f segment -segment_time 300 -c copy part%03d.m4a
```

### Interactive Mode Not Asking Questions

**Problem**: Running with `--interactive` but no prompts appear.

**Solution**: 

1. Make sure you're not also using `--batch`:
```bash
# Wrong - batch overrides interactive
protokoll --interactive --batch

# Correct
protokoll --interactive
```

2. Check if all entities are already in context (no questions needed).

### Transcription Quality Issues

**Problem**: Raw Whisper output has many errors.

**Solutions**:

1. Try the newer transcription model:
```bash
protokoll --transcription-model gpt-4o-transcribe
```

2. Ensure good audio quality:
   - Reduce background noise
   - Speak clearly
   - Use a good microphone

3. Add more context for domain-specific terms:
```yaml
# ~/.protokoll/terms/technical.yaml
id: kubernetes
term: Kubernetes
sounds_like:
  - "kube"
  - "k8s"
  - "kuber netties"
```

### Self-Reflection Reports Missing

**Problem**: No reflection reports generated.

**Solution**: Enable self-reflection explicitly:
```bash
protokoll --self-reflection --input-directory ./recordings
```

Check the output directory:
```bash
ls -la output/protokoll/*-reflection.md
```

### Permission Errors

**Problem**: Can't write to output directory.

**Solution**: Check directory permissions:
```bash
# Check permissions
ls -la ~/notes

# Fix permissions
chmod 755 ~/notes
```

Or specify a different output directory:
```bash
protokoll --output-directory ./local-output --input-directory ./recordings
```

## Debug Mode

For detailed troubleshooting, enable debug mode:

```bash
protokoll --debug --verbose --input-directory ./recordings
```

This will:
- Show detailed logging
- Keep all intermediate files
- Display API requests/responses

Check intermediate files in `output/protokoll/`:
- `*-transcript.json` - Raw Whisper output
- `*-context.json` - Context snapshot used
- `*-request.json` - LLM request sent
- `*-response.json` - LLM response received
- `*-reflection.md` - Self-reflection report

## Getting Help

If you're still having issues:

1. Check the [examples documentation](./examples.md)
2. Run with `--debug --verbose` and review the output
3. Check intermediate files for clues
4. File an issue with:
   - Command used
   - Error message
   - Relevant config (sanitized)
   - Debug output

