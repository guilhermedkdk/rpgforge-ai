import { Injectable, Logger } from '@nestjs/common';
import { RuleItemKind } from '@prisma/client';
import type { RuleRelationType } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma.service';
import {
  ALLOWED_PACK_SLUGS,
  fetchDocumentByKey,
  fetchSpells,
  fetchFeats,
  fetchItems,
  fetchClasses,
  fetchBackgrounds,
  fetchRaces,
  fetchAbilities,
  fetchRulesets,
  type Open5eRuleset,
} from './open5e-client';
import { deriveTagKeys } from './tag-derivation';
import { mapOpen5eToRuleItemPayload } from './mappers';

const SOURCE_VERSION = 'v2';

/** Scope for ingestion: run only one type (fewer API calls) or everything. */
export type IngestionScope =
  | 'all'
  | 'items'
  | 'spells'
  | 'feats'
  | 'backgrounds'
  | 'races'
  | 'abilities'
  | 'classes'
  | 'rulesets';

export const INGESTION_SCOPES: IngestionScope[] = [
  'all',
  'items',
  'spells',
  'feats',
  'backgrounds',
  'races',
  'abilities',
  'classes',
  'rulesets',
];

@Injectable()
export class Open5eIngestionService {
  private readonly logger = new Logger(Open5eIngestionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async run(options?: {
    scope?: IngestionScope;
  }): Promise<{ packId: string; counts: Record<string, number>; durationMs: number }> {
    const scope: IngestionScope = options?.scope ?? 'all';
    const startMs = Date.now();
    const docKey = ALLOWED_PACK_SLUGS[0];

    this.logger.log('═══════════════════════════════════════════════════════');
    this.logger.log(`  SRD Ingestion (Open5e) — Escopo: ${scope}`);
    this.logger.log('═══════════════════════════════════════════════════════');
    this.logger.log('');

    const doc = await fetchDocumentByKey(docKey);
    if (!doc) {
      throw new Error(`Open5e document not found: ${docKey}`);
    }
    this.logger.log(`Documento: ${doc.name} (${doc.key})`);
    const pack = await this.ensurePack(doc);
    this.logger.log(`Pack: ${pack.name} — id: ${pack.id}`);
    this.logger.log('');

    const counts: Record<string, number> = {};

    if (scope === 'all' || scope === 'spells') {
      this.logger.log('Buscando magias...');
      const spells = await fetchSpells(docKey);
      this.logger.log(`  Fetch: ${spells.length} magias`);
      this.logger.log('Inserindo magias...');
      for (const raw of spells as Record<string, unknown>[]) {
        await this.upsertRuleItem('SPELL', raw, pack.id);
      }
      counts['spells'] = spells.length;
      this.logger.log(`  ✓ ${spells.length} magias`);
      this.logger.log('');
    }

    if (scope === 'all' || scope === 'feats') {
      this.logger.log('Buscando talentos (feats)...');
      const feats = await fetchFeats(docKey);
      this.logger.log(`  Fetch: ${feats.length} talentos`);
      this.logger.log('Inserindo talentos...');
      for (const raw of feats as Record<string, unknown>[]) {
        await this.upsertRuleItem('FEAT', raw, pack.id);
      }
      counts['feats'] = feats.length;
      this.logger.log(`  ✓ ${feats.length} talentos`);
      this.logger.log('');
    }

    if (scope === 'all' || scope === 'items') {
      this.logger.log('Buscando itens (armas, armaduras, equipamentos)...');
      const items = await fetchItems(docKey);
      this.logger.log(`  Fetch: ${items.length} itens`);
      this.logger.log('Inserindo itens...');
      for (const raw of items as Record<string, unknown>[]) {
        await this.upsertRuleItem('ITEM' as RuleItemKind, raw, pack.id);
      }
      counts['items'] = items.length;
      this.logger.log(`  ✓ ${items.length} itens`);
      this.logger.log('');
    }

    if (scope === 'all' || scope === 'backgrounds') {
      this.logger.log('Buscando antecedentes...');
      const backgrounds = await fetchBackgrounds(docKey);
      this.logger.log(`  Fetch: ${backgrounds.length} antecedentes`);
      this.logger.log('Inserindo antecedentes...');
      for (const raw of backgrounds as Record<string, unknown>[]) {
        await this.upsertRuleItem('BACKGROUND', raw, pack.id);
      }
      counts['backgrounds'] = backgrounds.length;
      this.logger.log(`  ✓ ${backgrounds.length} antecedentes`);
      this.logger.log('');
    }

    if (scope === 'all' || scope === 'races') {
      this.logger.log('Buscando raças...');
      const races = await fetchRaces(docKey);
      this.logger.log(`  Fetch: ${races.length} raças`);
      this.logger.log('Inserindo raças...');
      for (const raw of races as Record<string, unknown>[]) {
        await this.upsertRuleItem('RACE', raw, pack.id);
      }
      counts['races'] = races.length;
      this.logger.log(`  ✓ ${races.length} raças`);
      this.logger.log('');
    }

    if (scope === 'all' || scope === 'abilities') {
      this.logger.log('Buscando habilidades...');
      const abilities = await fetchAbilities(docKey);
      this.logger.log(`  Fetch: ${abilities.length} habilidades`);
      this.logger.log('Inserindo habilidades...');
      for (const raw of abilities as Record<string, unknown>[]) {
        await this.upsertRuleItem('ABILITY' as RuleItemKind, raw, pack.id);
      }
      counts['abilities'] = abilities.length;
      this.logger.log(`  ✓ ${abilities.length} habilidades`);
      this.logger.log('');
    }

    let classes: Record<string, unknown>[] = [];
    if (scope === 'all' || scope === 'classes') {
      this.logger.log('Buscando classes...');
      classes = (await fetchClasses(docKey)) as Record<string, unknown>[];
      this.logger.log(`  Fetch: ${classes.length} classes`);
      this.logger.log('Inserindo classes, subclasses e características...');
      const classCount = await this.ingestClassesAndSubclasses(classes, pack.id);
      counts['classes'] = classCount.classes;
      counts['subclasses'] = classCount.subclasses;
      counts['class_features'] = classCount.features;
      this.logger.log(
        `  ✓ ${classCount.classes} classes, ${classCount.subclasses} subclasses, ${classCount.features} características`
      );
      this.logger.log('');
    }

    if (scope === 'all' || scope === 'spells') {
      this.logger.log('Criando relações: magia e classe...');
      await this.createSpellClassRelations(pack.id);
      this.logger.log('  ✓ Relações de magias criadas');
      this.logger.log('');
    }

    if (scope === 'all' || scope === 'classes') {
      this.logger.log('Criando relações: subclasse e características...');
      await this.createSubclassAndFeatureRelations(pack.id, classes);
      this.logger.log('  ✓ Relações de subclasses/características criadas');
      this.logger.log('');
    }

    if (scope === 'all' || scope === 'rulesets') {
      this.logger.log('Buscando rulesets...');
      const rulesets = (await fetchRulesets(docKey)) as Open5eRuleset[];
      const rulesCount = rulesets.reduce((sum, rs) => sum + (rs.rules?.length ?? 0), 0);
      this.logger.log(`  Fetch: ${rulesets.length} rulesets, ${rulesCount} rules`);
      this.logger.log('Inserindo rulesets e rules (regras)...');
      const rulesetCounts = await this.ingestRulesets(rulesets, pack.id);
      counts['rulesets'] = rulesetCounts.rulesets;
      counts['rules'] = rulesetCounts.rules;
      this.logger.log(`  ✓ ${rulesetCounts.rulesets} rulesets, ${rulesetCounts.rules} rules`);
      this.logger.log('');
    }

    const durationMs = Date.now() - startMs;
    const totalItems = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);

    this.logger.log('───────────────────────────────────────────────────────');
    this.logger.log(
      `Ingestão concluída em ${(durationMs / 1000).toFixed(2)}s — ${totalItems} itens no total`
    );
    this.logger.log('═══════════════════════════════════════════════════════');

    return { packId: pack.id, counts, durationMs };
  }

  private async ensurePack(doc: { key: string; permalink?: string }) {
    const PACK_SLUG = 'dnd-srd-5-2';
    const PACK_NAME = 'D&D SRD 5.2';
    const PACK_DESCRIPTION =
      'Documento de Referência do Sistema oficial de Dungeons & Dragons 5ª Edição. Contém as regras essenciais, classes, magias, equipamentos e conteúdo de criação de personagens lançado sob Creative Commons Atribuição 4.0, adequado para criar personagens e ferramentas compatíveis.';
    const ATTRIBUTION_TEXT =
      'This work includes material taken from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC and has been modified. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License.';
    const LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';

    const pack = await this.prisma.pack.upsert({
      where: { slug: PACK_SLUG },
      create: {
        slug: PACK_SLUG,
        name: PACK_NAME,
        version: '5.2',
        description: PACK_DESCRIPTION,
        systemName: 'D&D 5e',
        externalKey: doc.key,
        apiVersionHint: 'v2',
        permalink: doc.permalink ?? null,
        licenseType: 'CC_BY_4_0',
        licenseUrl: LICENSE_URL,
        attributionText: ATTRIBUTION_TEXT,
        isEnabled: true,
      },
      update: {
        externalKey: doc.key,
        permalink: doc.permalink ?? null,
      },
    });
    return pack;
  }

  private async upsertRuleItem(
    kind: RuleItemKind,
    item: Record<string, unknown>,
    packId: string
  ): Promise<string> {
    const payload = mapOpen5eToRuleItemPayload(
      kind as unknown as import('@rpgforce-ai/shared').RuleItemKind,
      item,
      packId
    );
    // Use payload.raw so tags match persisted data (e.g. ITEM category overrides in mapper).
    const tagKeys = deriveTagKeys(
      kind as unknown as import('@rpgforce-ai/shared').RuleItemKind,
      payload.raw as Record<string, unknown>
    );

    const ruleItem = await this.prisma.ruleItem.upsert({
      where: {
        packId_kind_sourceKey: {
          packId,
          kind: payload.kind,
          sourceKey: payload.sourceKey,
        },
      },
      create: {
        packId: payload.packId,
        kind: payload.kind,
        source: 'open5e',
        sourceKey: payload.sourceKey,
        sourceUrl: payload.sourceUrl,
        sourceVersion: SOURCE_VERSION,
        name: payload.name,
        slug: payload.sourceKey,
        contentMd: payload.contentMd,
        raw: payload.raw as object,
        normalized: payload.normalized as object | null,
      },
      update: {
        sourceUrl: payload.sourceUrl,
        name: payload.name,
        slug: payload.sourceKey,
        contentMd: payload.contentMd,
        raw: payload.raw as object,
        normalized: payload.normalized as object | null,
      },
    });

    await this.syncTags(ruleItem.id, tagKeys);
    return ruleItem.id;
  }

  private async syncTags(ruleItemId: string, tagKeys: string[]): Promise<void> {
    const existing = await this.prisma.ruleItemTag.findMany({
      where: { ruleItemId },
      include: { tag: true },
    });
    const existingKeys = new Set(existing.map((t) => t.tag.key));
    const toAdd = tagKeys.filter((k) => !existingKeys.has(k));
    const toRemove = existing.filter((e) => !tagKeys.includes(e.tag.key));

    for (const key of toAdd) {
      const tag = await this.prisma.tag.upsert({
        where: { key },
        create: { key, name: key },
        update: {},
      });
      await this.prisma.ruleItemTag.upsert({
        where: {
          ruleItemId_tagId: { ruleItemId, tagId: tag.id },
        },
        create: { ruleItemId, tagId: tag.id },
        update: {},
      });
    }
    for (const r of toRemove) {
      await this.prisma.ruleItemTag.delete({
        where: { ruleItemId_tagId: { ruleItemId, tagId: r.tagId } },
      });
    }
  }

  private async ingestClassesAndSubclasses(
    classes: Record<string, unknown>[],
    packId: string
  ): Promise<{ classes: number; subclasses: number; features: number }> {
    let classCount = 0;
    let subclassCount = 0;
    let featureCount = 0;

    const byKey = new Map<string, Record<string, unknown>>();
    for (const c of classes) {
      const key = c.key as string;
      if (key) byKey.set(key, c);
    }

    for (const c of classes) {
      const docKey = (c.document as { key?: string })?.key;
      if (docKey !== 'srd-2024') continue;

      const subclassOf = c.subclass_of as { key?: string } | undefined;
      if (subclassOf) {
        await this.upsertRuleItem('SUBCLASS', c, packId);
        subclassCount++;
      } else {
        await this.upsertRuleItem('CLASS', c, packId);
        classCount++;
      }

      const features = (c.features as Array<Record<string, unknown>>) ?? [];
      for (const f of features) {
        const fKey = f.key as string;
        if (!fKey) continue;
        const combined = {
          ...f,
          document: c.document,
          key: fKey,
          name: f.name,
          desc: f.desc,
          url: (c as { url?: string }).url,
        };
        await this.upsertRuleItem('CLASS_FEATURE', combined, packId);
        featureCount++;
      }
    }

    return { classes: classCount, subclasses: subclassCount, features: featureCount };
  }

  private async createSpellClassRelations(packId: string): Promise<void> {
    const spells = await this.prisma.ruleItem.findMany({
      where: { packId, kind: 'SPELL' },
      select: { id: true, raw: true, sourceKey: true },
    });

    for (const spell of spells) {
      const raw = spell.raw as { classes?: Array<{ key?: string }> };
      const classes = raw?.classes ?? [];
      for (const cls of classes) {
        const classKey = cls?.key;
        if (!classKey) continue;
        const toItem = await this.prisma.ruleItem.findFirst({
          where: { packId, sourceKey: classKey, kind: { in: ['CLASS', 'SUBCLASS'] } },
        });
        if (toItem) {
          await this.prisma.ruleItemRelation.upsert({
            where: {
              fromId_toId_type: {
                fromId: spell.id,
                toId: toItem.id,
                type: 'SPELL_AVAILABLE_TO_CLASS',
              },
            },
            create: {
              fromId: spell.id,
              toId: toItem.id,
              type: 'SPELL_AVAILABLE_TO_CLASS' as RuleRelationType,
            },
            update: {},
          });
        }
      }
    }
  }

  private async ingestRulesets(
    rulesets: Open5eRuleset[],
    packId: string
  ): Promise<{ rulesets: number; rules: number }> {
    let rulesetCount = 0;
    let ruleCount = 0;

    for (const rs of rulesets) {
      const rulesetRaw: Record<string, unknown> = {
        key: rs.key,
        name: rs.name,
        desc: rs.desc ?? '',
        url: rs.url,
        document: rs.document,
      };

      const rulesetContentMd = [
        `# ${rs.name}`,
        '',
        `> Fonte: Open5e (v2)`,
        `> Documento: srd-2024`,
        `> URL: ${rs.url ?? ''}`,
        '',
        '## Descrição',
        rs.desc ?? '',
      ].join('\n');

      const rulesetId = await this.upsertRuleItemRaw(
        'RULESET',
        rs.key,
        rs.name,
        rs.url ?? null,
        rulesetContentMd,
        rulesetRaw,
        { ruleCount: (rs.rules ?? []).length, documentKey: rs.document?.key ?? null },
        packId
      );
      await this.syncTags(rulesetId, deriveTagKeys('RULESET', rulesetRaw));
      rulesetCount++;

      for (const rule of rs.rules ?? []) {
        const sourceKey = `${rs.key}_rule-${rule.index}`;
        const ruleRaw: Record<string, unknown> = {
          name: rule.name,
          desc: rule.desc ?? '',
          index: rule.index,
          initialHeaderLevel: rule.initialHeaderLevel,
          url: rule.url,
          document: rule.document,
          ruleset: rule.ruleset,
          rulesetKey: rs.key,
        };

        const ruleContentMd = [
          `# ${rule.name}`,
          '',
          `> Fonte: Open5e (v2)`,
          `> Documento: srd-2024`,
          `> Ruleset: ${rs.name} (${rs.key})`,
          `> Index: ${rule.index}`,
          `> URL: ${rule.url ?? ''}`,
          '',
          rule.desc ?? '',
        ].join('\n');

        const ruleId = await this.upsertRuleItemRaw(
          'RULE',
          sourceKey,
          rule.name,
          rule.url ?? null,
          ruleContentMd,
          ruleRaw,
          {
            index: rule.index,
            initialHeaderLevel: rule.initialHeaderLevel ?? null,
            rulesetKey: rs.key,
            documentKey: rs.document?.key ?? null,
          },
          packId
        );
        await this.syncTags(ruleId, deriveTagKeys('RULE', ruleRaw));
        ruleCount++;

        await this.prisma.ruleItemRelation.upsert({
          where: {
            fromId_toId_type: {
              fromId: rulesetId,
              toId: ruleId,
              type: 'RULESET_HAS_RULE' as RuleRelationType,
            },
          },
          create: {
            fromId: rulesetId,
            toId: ruleId,
            type: 'RULESET_HAS_RULE' as unknown as RuleRelationType,
            meta: { index: rule.index, initialHeaderLevel: rule.initialHeaderLevel ?? null },
          },
          update: {
            meta: { index: rule.index, initialHeaderLevel: rule.initialHeaderLevel ?? null },
          },
        });
      }
    }

    return { rulesets: rulesetCount, rules: ruleCount };
  }

  private async upsertRuleItemRaw(
    kind: import('@prisma/client').RuleItemKind,
    sourceKey: string,
    name: string,
    sourceUrl: string | null,
    contentMd: string,
    raw: Record<string, unknown>,
    normalized: Record<string, unknown>,
    packId: string
  ): Promise<string> {
    const ruleItem = await this.prisma.ruleItem.upsert({
      where: { packId_kind_sourceKey: { packId, kind, sourceKey } },
      create: {
        packId,
        kind,
        source: 'open5e',
        sourceKey,
        sourceUrl,
        sourceVersion: SOURCE_VERSION,
        name,
        slug: sourceKey,
        contentMd,
        raw: raw as object,
        normalized: normalized as object,
      },
      update: {
        sourceUrl,
        name,
        slug: sourceKey,
        contentMd,
        raw: raw as object,
        normalized: normalized as object,
      },
    });
    return ruleItem.id;
  }

  private async createSubclassAndFeatureRelations(
    packId: string,
    classes: Record<string, unknown>[]
  ): Promise<void> {
    for (const c of classes) {
      const docKey = (c.document as { key?: string })?.key;
      if (docKey !== 'srd-2024') continue;

      const sourceKey = c.key as string;
      const subclassOf = c.subclass_of as { key?: string } | undefined;

      const classOrSubclass = await this.prisma.ruleItem.findFirst({
        where: { packId, sourceKey, kind: { in: ['CLASS', 'SUBCLASS'] } },
      });
      if (!classOrSubclass) continue;

      if (subclassOf) {
        const parent = await this.prisma.ruleItem.findFirst({
          where: { packId, sourceKey: subclassOf.key, kind: 'CLASS' },
        });
        if (parent) {
          await this.prisma.ruleItemRelation.upsert({
            where: {
              fromId_toId_type: {
                fromId: classOrSubclass.id,
                toId: parent.id,
                type: 'SUBCLASS_OF',
              },
            },
            create: {
              fromId: classOrSubclass.id,
              toId: parent.id,
              type: 'SUBCLASS_OF' as RuleRelationType,
            },
            update: {},
          });
        }
      }

      const features =
        (c.features as Array<{ key?: string; gained_at?: Array<{ level?: number }> }>) ?? [];
      const relationType = subclassOf ? 'SUBCLASS_HAS_FEATURE' : 'CLASS_HAS_FEATURE';
      for (const f of features) {
        const fKey = f?.key;
        if (!fKey) continue;
        const featureItem = await this.prisma.ruleItem.findFirst({
          where: { packId, sourceKey: fKey, kind: 'CLASS_FEATURE' },
        });
        if (!featureItem) continue;
        const level = f.gained_at?.[0]?.level;
        await this.prisma.ruleItemRelation.upsert({
          where: {
            fromId_toId_type: {
              fromId: classOrSubclass.id,
              toId: featureItem.id,
              type: relationType as RuleRelationType,
            },
          },
          create: {
            fromId: classOrSubclass.id,
            toId: featureItem.id,
            type: relationType as RuleRelationType,
            meta: level != null ? { level } : undefined,
          },
          update: { meta: level != null ? { level } : undefined },
        });
      }
    }
  }
}
