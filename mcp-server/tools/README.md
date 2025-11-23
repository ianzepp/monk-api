# MCP Tool Definitions

This directory contains individual JSON files for each MCP tool definition. Each file defines a single tool that Claude Code can use to interact with the Monk API.

## Structure

Each tool definition file must follow this JSON Model format:

```json
{
  "name": "ToolName",
  "description": "What the tool does and when to use it",
  "inputModel": {
    "type": "object",
    "properties": {
      "param_name": {
        "type": "string|number|object|array|boolean",
        "description": "What this parameter does"
      }
    },
    "required": ["required_param_names"]
  }
}
```

## Tool Categories

### Authentication (3 tools)
- `monk-auth-register.json` - Register new tenant (convenience)
- `monk-auth-login.json` - Login to tenant (convenience)
- `monk-auth.json` - Generic auth operations

### Data Operations (3 tools)
- `monk-api-data.json` - CRUD operations
- `monk-api-find.json` - Advanced search with filters
- `monk-api-aggregate.json` - Analytics and aggregation

### Metadata & Introspection (4 tools)
- `monk-api-stat.json` - Record metadata only
- `monk-api-describe.json` - Model information
- `monk-api-history.json` - Audit trails
- `monk-docs.json` - API documentation

### Low-Level (1 tool)
- `monk-http.json` - Raw HTTP requests

## How It Works

1. **Startup**: When the MCP server starts, it reads all `.json` files from this directory
2. **Loading**: The `loadToolDefinitions()` function parses each JSON file
3. **Registration**: Tools are registered with the MCP server
4. **Discovery**: Claude Code queries available tools via `tools/list`
5. **Execution**: When Claude calls a tool, the server routes to the appropriate handler

## Adding a New Tool

1. **Create JSON file**: `tools/my-new-tool.json`
   ```json
   {
     "name": "MyNewTool",
     "description": "What it does and when to use it",
     "inputModel": {
       "type": "object",
       "properties": {
         "param1": {
           "type": "string",
           "description": "First parameter"
         }
       },
       "required": ["param1"]
     }
   }
   ```

2. **Add handler function** in `monk-api-tools.ts`:
   ```typescript
   async function myNewTool(param1: string): Promise<any> {
     // Implementation
   }
   ```

3. **Add case to switch statement** in `CallToolRequestModel`:
   ```typescript
   case 'MyNewTool':
     result = await myNewTool(args.param1);
     break;
   ```

4. **Restart MCP server**: Changes are loaded at startup

## Best Practices

### Tool Names
- Use PascalCase (e.g., `MonkApiData`)
- Prefix with `Monk` for consistency
- Be descriptive but concise

### Descriptions
- Explain WHAT the tool does
- Explain WHEN to use it
- Mention key capabilities
- Be specific about requirements (e.g., "Requires authentication")

**Good:**
```
"Advanced search and filtering for records. Use when basic Data API filtering is insufficient or when you need analytics-style queries."
```

**Bad:**
```
"Search records"
```

### Input Model
- Use clear parameter names
- Provide detailed descriptions for each parameter
- Mark required parameters correctly
- Use enums for constrained values
- Provide examples in descriptions when helpful

### File Naming
- Use kebab-case: `monk-api-find.json`
- Match the tool name (PascalCase → kebab-case)
- Use `.json` extension

## Validation

The JSON files must be valid JSON and conform to the MCP tool model. Invalid JSON or missing required fields will cause the server to fail at startup.

## Benefits of This Approach

1. **Modularity**: Each tool in its own file
2. **Maintainability**: Easy to find and edit specific tools
3. **Version Control**: Clear diffs when tools change
4. **Documentation**: Self-documenting through structure
5. **No Rebuild**: Just edit JSON and restart (no TypeScript compilation)
6. **Discoverability**: Easy to see what tools exist by listing files
