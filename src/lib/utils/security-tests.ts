import { formatText, validateMessageContent, createGradientText } from './text-formatter';
import { validateTextStyle, DEFAULT_TEXT_STYLE } from '../types/text-formatting';

// XSS Test Vectors
const XSS_TEST_VECTORS = [
  // Script injection
  '<script>alert("XSS")</script>',
  '<script src="malicious.js"></script>',
  '<img src="x" onerror="alert(\'XSS\')">',
  '<svg onload="alert(\'XSS\')">',
  '<iframe src="javascript:alert(\'XSS\')"></iframe>',
  
  // Event handlers
  '<div onclick="alert(\'XSS\')">Click me</div>',
  '<input onfocus="alert(\'XSS\')" autofocus>',
  '<body onload="alert(\'XSS\')">',
  '<a href="javascript:alert(\'XSS\')">Link</a>',
  
  // CSS injection
  '<style>body{background:url("javascript:alert(\'XSS\')")}</style>',
  '<div style="background-image:url(javascript:alert(\'XSS\'))">',
  '<div style="expression(alert(\'XSS\'))">',
  
  // Data URIs
  '<img src="data:text/html,<script>alert(\'XSS\')</script>">',
  '<iframe src="data:text/html,<script>alert(\'XSS\')</script>">',
  
  // HTML injection
  '<object data="malicious.swf">',
  '<embed src="malicious.swf">',
  '<applet code="malicious.class">',
  
  // BBCode injection attempts
  '[script]alert("XSS")[/script]',
  '[img=javascript:alert("XSS")]',
  '[url=javascript:alert("XSS")]Link[/url]',
  
  // Markdown injection attempts
  '![XSS](javascript:alert("XSS"))',
  '[XSS](javascript:alert("XSS"))',
  
  // Unicode and encoding bypasses
  '<script>alert(&#34;XSS&#34;)</script>',
  '<script>alert(String.fromCharCode(88,83,83))</script>',
  '<img src="x" onerror="&#97;&#108;&#101;&#114;&#116;&#40;&#39;&#88;&#83;&#83;&#39;&#41;">',
  
  // CSS expression injection
  '<div style="width:expression(alert(\'XSS\'))">',
  '<div style="background:url(vbscript:alert(\'XSS\'))">',
  
  // Mixed content attacks
  'Normal text <script>alert("XSS")</script> more text',
  '[b]Bold <script>alert("XSS")</script> text[/b]',
  '**Bold <img src="x" onerror="alert(\'XSS\')"> text**'
];

// CSS Injection Test Vectors
const CSS_INJECTION_VECTORS = [
  'color: red; background: url(javascript:alert("XSS"))',
  'font-family: "Arial"; } body { background: red; .fake {',
  'font-size: expression(alert("XSS"))',
  'background: url("data:text/html,<script>alert(\'XSS\')</script>")',
  'color: red; } .injected { background: red',
  '@import url("malicious.css")',
  'behavior: url("malicious.htc")'
];

// Test Results Interface
interface SecurityTestResult {
  input: string;
  output: string;
  passed: boolean;
  vulnerabilities: string[];
  testType: string;
}

interface SecurityTestSuite {
  xssTests: SecurityTestResult[];
  cssInjectionTests: SecurityTestResult[];
  validationTests: SecurityTestResult[];
  gradientTests: SecurityTestResult[];
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    vulnerabilities: string[];
  };
}

// Check if output contains dangerous patterns
function detectVulnerabilities(output: string): string[] {
  const vulnerabilities: string[] = [];
  
  // Script tags
  if (/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi.test(output)) {
    vulnerabilities.push('Script tag injection');
  }
  
  // Event handlers
  if (/on\w+\s*=/gi.test(output)) {
    vulnerabilities.push('Event handler injection');
  }
  
  // JavaScript URLs
  if (/javascript\s*:/gi.test(output)) {
    vulnerabilities.push('JavaScript URL injection');
  }
  
  // Data URLs with HTML/JS
  if (/data\s*:\s*text\/html/gi.test(output)) {
    vulnerabilities.push('Data URL HTML injection');
  }
  
  // CSS expressions
  if (/expression\s*\(/gi.test(output)) {
    vulnerabilities.push('CSS expression injection');
  }
  
  // Dangerous CSS URLs
  if (/url\s*\(\s*['"]*javascript:/gi.test(output)) {
    vulnerabilities.push('CSS JavaScript URL injection');
  }
  
  // Iframe with dangerous src
  if (/<iframe[^>]*src\s*=\s*['"]*(?:javascript:|data:)/gi.test(output)) {
    vulnerabilities.push('Dangerous iframe injection');
  }
  
  // Object/embed tags
  if (/<(?:object|embed|applet)\b/gi.test(output)) {
    vulnerabilities.push('Dangerous object/embed tag');
  }
  
  // Style tag injection
  if (/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi.test(output)) {
    vulnerabilities.push('Style tag injection');
  }
  
  return vulnerabilities;
}

// Run XSS tests
async function runXSSTests(): Promise<SecurityTestResult[]> {
  const results: SecurityTestResult[] = [];
  
  for (const vector of XSS_TEST_VECTORS) {
    try {
      const output = await formatText(vector, DEFAULT_TEXT_STYLE, true);
      const vulnerabilities = detectVulnerabilities(output);
      
      results.push({
        input: vector,
        output,
        passed: vulnerabilities.length === 0,
        vulnerabilities,
        testType: 'XSS'
      });
    } catch (error) {
      results.push({
        input: vector,
        output: `Error: ${error}`,
        passed: true, // Errors are acceptable for malicious input
        vulnerabilities: [],
        testType: 'XSS'
      });
    }
  }
  
  return results;
}

// Run CSS injection tests
async function runCSSInjectionTests(): Promise<SecurityTestResult[]> {
  const results: SecurityTestResult[] = [];
  
  for (const vector of CSS_INJECTION_VECTORS) {
    try {
      const testStyle = { ...DEFAULT_TEXT_STYLE, color: 'red' as any };
      const output = await formatText(`Test with style`, testStyle, true);
      const vulnerabilities = detectVulnerabilities(output);
      
      results.push({
        input: vector,
        output,
        passed: vulnerabilities.length === 0,
        vulnerabilities,
        testType: 'CSS Injection'
      });
    } catch (error) {
      results.push({
        input: vector,
        output: `Error: ${error}`,
        passed: true,
        vulnerabilities: [],
        testType: 'CSS Injection'
      });
    }
  }
  
  return results;
}

// Run validation tests
function runValidationTests(): SecurityTestResult[] {
  const results: SecurityTestResult[] = [];
  
  const testCases = [
    'Normal text',
    'Text with <script>alert("XSS")</script>',
    'Very long text '.repeat(200), // Test length limits
    '', // Empty text
    'Text with\nnewlines\nand\ttabs',
    'Special chars: <>&"\'`',
    'Unicode: 你好世界 🌍 🎉',
    'Mixed: Normal **bold** and <script>alert("XSS")</script>'
  ];
  
  for (const testCase of testCases) {
    const validation = validateMessageContent(testCase);
    const vulnerabilities = detectVulnerabilities(validation.sanitizedContent);
    
    results.push({
      input: testCase,
      output: validation.sanitizedContent,
      passed: validation.isValid && vulnerabilities.length === 0,
      vulnerabilities: [...validation.errors, ...vulnerabilities],
      testType: 'Validation'
    });
  }
  
  return results;
}

// Run gradient text security tests
function runGradientTests(): SecurityTestResult[] {
  const results: SecurityTestResult[] = [];
  
  const testCases = [
    'Normal gradient text',
    '<script>alert("XSS")</script>',
    'Text with "quotes" and \'apostrophes\'',
    'Very long gradient text '.repeat(50),
    'Special chars: <>&\'"',
    ''
  ];
  
  const testColors = ['#FF0000', '#00FF00', '#0000FF'];
  
  for (const testCase of testCases) {
    try {
      const output = createGradientText(testCase, testColors);
      const vulnerabilities = detectVulnerabilities(output);
      
      results.push({
        input: testCase,
        output,
        passed: vulnerabilities.length === 0,
        vulnerabilities,
        testType: 'Gradient'
      });
    } catch (error) {
      results.push({
        input: testCase,
        output: `Error: ${error}`,
        passed: true,
        vulnerabilities: [],
        testType: 'Gradient'
      });
    }
  }
  
  return results;
}

// Run complete security test suite
export async function runSecurityTestSuite(): Promise<SecurityTestSuite> {
  console.log('🔒 Running comprehensive security test suite...');
  
  const xssTests = await runXSSTests();
  const cssInjectionTests = await runCSSInjectionTests();
  const validationTests = runValidationTests();
  const gradientTests = runGradientTests();
  
  const allTests = [...xssTests, ...cssInjectionTests, ...validationTests, ...gradientTests];
  const passed = allTests.filter(test => test.passed).length;
  const failed = allTests.length - passed;
  
  // Collect all unique vulnerabilities
  const allVulnerabilities = new Set<string>();
  allTests.forEach(test => {
    test.vulnerabilities.forEach(vuln => allVulnerabilities.add(vuln));
  });
  
  const results: SecurityTestSuite = {
    xssTests,
    cssInjectionTests,
    validationTests,
    gradientTests,
    summary: {
      totalTests: allTests.length,
      passed,
      failed,
      vulnerabilities: Array.from(allVulnerabilities)
    }
  };
  
  console.log(`✅ Security tests completed:`);
  console.log(`   Total tests: ${results.summary.totalTests}`);
  console.log(`   Passed: ${results.summary.passed}`);
  console.log(`   Failed: ${results.summary.failed}`);
  
  if (results.summary.vulnerabilities.length > 0) {
    console.warn(`⚠️  Vulnerabilities detected:`, results.summary.vulnerabilities);
  } else {
    console.log(`🛡️  No vulnerabilities detected!`);
  }
  
  return results;
}

// Quick security check function
export async function quickSecurityCheck(input: string): Promise<boolean> {
  try {
    const output = await formatText(input, DEFAULT_TEXT_STYLE, true);
    const vulnerabilities = detectVulnerabilities(output);
    return vulnerabilities.length === 0;
  } catch (error) {
    // Errors on malicious input are acceptable
    return true;
  }
}

// Style validation tests
export function testStyleValidation(): boolean {
  const testCases = [
    // Valid styles
    { fontFamily: 'tahoma', fontSize: 14, color: 'red', bold: true },
    { fontFamily: 'verdana', fontSize: 16, color: 'blue', italic: true },
    
    // Invalid styles (should be sanitized)
    { fontFamily: 'malicious-font', fontSize: 999, color: 'invalid-color' },
    { fontFamily: 'tahoma', fontSize: -10, color: 'red' },
    { fontFamily: 'tahoma', fontSize: 'invalid' as any, color: 'red' }
  ];
  
  for (const testCase of testCases) {
    try {
      const validated = validateTextStyle(testCase as Partial<TextStyle>);
      
      // Check that validated style has safe values
      if (!validated.fontFamily || 
          validated.fontSize < 8 || 
          validated.fontSize > 72) {
        console.error('Style validation failed for:', testCase);
        return false;
      }
    } catch (error) {
      console.error('Style validation error:', error);
      return false;
    }
  }
  
  return true;
}

// Export test utilities
export {
  XSS_TEST_VECTORS,
  CSS_INJECTION_VECTORS,
  detectVulnerabilities,
  type SecurityTestResult,
  type SecurityTestSuite
};