declare module 'hanzi' {
  export interface HanziDefinitionEntry {
    traditional: string;
    simplified: string;
    pinyin: string;
    definition: string;
  }

  export interface HanziDecomposeResult {
    character: string;
    components1: string[];
    components2: string[];
    components3: string[];
    components4?: string[];
  }

  export function start(): void;
  export function definitionLookup(word: string, scriptType?: 's' | 't'): HanziDefinitionEntry[] | undefined;
  export function decompose(character: string, levelOfDecomposition?: number): HanziDecomposeResult;
  export function getRadicalMeaning(radical: string): string | undefined;
  export function getExamples(character: string): HanziDefinitionEntry[] | undefined;
}
