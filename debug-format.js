// Debug format detection
const testRequest = {
  model: 'gpt-4',
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Test prompt',
        },
      ],
    },
  ],
  max_tokens: 100,
  'anthropic-version': '2023-06-01',
};

console.log('Test request:', JSON.stringify(testRequest, null, 2));

// Check individual indicators
console.log('Has anthropic-version:', 'anthropic-version' in testRequest);
console.log('Has system:', 'system' in testRequest && typeof testRequest.system === 'string');
console.log('Model starts with claude-:', typeof testRequest.model === 'string' && testRequest.model.startsWith('claude-'));

// Check content blocks
const messages = testRequest.messages;
if (Array.isArray(messages)) {
  console.log('Messages is array:', true);
  const firstMessage = messages[0];
  if (firstMessage && typeof firstMessage === 'object' && 'content' in firstMessage) {
    console.log('First message has content:', true);
    const content = firstMessage.content;
    if (Array.isArray(content)) {
      console.log('Content is array:', true);
      const firstBlock = content[0];
      if (firstBlock && typeof firstBlock === 'object' && 'type' in firstBlock) {
        console.log('First block has type:', firstBlock.type);
        console.log('Type is valid:', ['text', 'image', 'tool_use', 'tool_result'].includes(firstBlock.type));
      }
    }
  }
}