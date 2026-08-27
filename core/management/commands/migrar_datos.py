import csv
import json
import os
from decimal import Decimal, InvalidOperation
from pathlib import Path
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.dateparse import parse_date, parse_datetime
from core.models import Empresa, Contacto, Proyecto


class Command(BaseCommand):
    help = "Migra y puebla la base de datos PostgreSQL desde data_storage.json y archivos de contactos."

    def add_arguments(self, parser):
        parser.add_argument(
            '--json-path',
            type=str,
            default=None,
            help='Ruta al archivo data_storage.json'
        )
        parser.add_argument(
            '--csv-path',
            type=str,
            default=None,
            help='Ruta al archivo Contactos_Procesados_CNTXT.csv'
        )
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Limpia los datos existentes antes de importar'
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("🚀 Iniciando migración de datos hacia la base de datos..."))

        base_dir = Path(__file__).resolve().parent.parent.parent.parent

        # 1. Determinar rutas de archivos
        json_candidates = [
            options['json_path'],
            str(base_dir / 'data_storage.json'),
            str(base_dir / 'frontend_legacy' / 'data_storage.json'),
        ]
        json_file = next((p for p in json_candidates if p and os.path.exists(p)), None)

        csv_candidates = [
            options['csv_path'],
            str(base_dir / 'Contactos_Procesados_CNTXT.csv'),
            str(base_dir / 'frontend_legacy' / 'Contactos_Procesados_CNTXT.csv'),
        ]
        csv_file = next((p for p in csv_candidates if p and os.path.exists(p)), None)

        if not json_file:
            self.stderr.write(self.style.ERROR("❌ No se encontró el archivo data_storage.json"))
            return

        self.stdout.write(self.style.SUCCESS(f"📂 Archivo JSON detectado: {json_file}"))
        if csv_file:
            self.stdout.write(self.style.SUCCESS(f"📂 Archivo CSV detectado: {csv_file}"))

        # Cargar JSON
        with open(json_file, 'r', encoding='utf-8-sig') as f:
            data = json.load(f)

        if options['clear']:
            self.stdout.write(self.style.WARNING("⚠️ Limpiando base de datos existente..."))
            Proyecto.objects.all().delete()
            Contacto.objects.all().delete()
            Empresa.objects.all().delete()

        with transaction.atomic():
            # ----------------------------------------------------
            # FASE 1: Migración de Master Empresas
            # ----------------------------------------------------
            self.stdout.write(self.style.MIGRATE_HEADING("\n--- 1. Migrando Empresas (master_empresas) ---"))
            empresas_creadas, empresas_actualizadas = self.migrar_empresas(data.get('master_empresas', []))
            self.stdout.write(self.style.SUCCESS(
                f"✅ Empresas procesadas: {empresas_creadas} creadas, {empresas_actualizadas} actualizadas."
            ))

            # ----------------------------------------------------
            # FASE 2: Migración de Contactos (CSV + custom_contacts)
            # ----------------------------------------------------
            self.stdout.write(self.style.MIGRATE_HEADING("\n--- 2. Migrando Contactos y Clasificaciones R.E.D. ---"))
            contactos_creados, contactos_actualizados = self.migrar_contactos(
                csv_path=csv_file,
                custom_contacts=data.get('custom_contacts', []),
                meta_overrides={
                    'pulses': data.get('pulses', {}),
                    'phases': data.get('phases', {}),
                    'channels': data.get('channels', {}),
                    'personas': data.get('personas', {}),
                    'notes': data.get('notes', {}),
                    'edits': data.get('edits', {}),
                }
            )
            self.stdout.write(self.style.SUCCESS(
                f"✅ Contactos procesados: {contactos_creados} creados, {contactos_actualizados} actualizados."
            ))

            # ----------------------------------------------------
            # FASE 3: Migración de Proyectos / Oportunidades
            # ----------------------------------------------------
            self.stdout.write(self.style.MIGRATE_HEADING("\n--- 3. Migrando Proyectos y Clasificaciones C.O.R. ---"))
            proyectos_creados, proyectos_actualizados = self.migrar_proyectos(data.get('projects', []))
            self.stdout.write(self.style.SUCCESS(
                f"✅ Proyectos procesados: {proyectos_creados} creados, {proyectos_actualizados} actualizados."
            ))

        self.stdout.write(self.style.SUCCESS("\n🎉 ¡Migración completada exitosamente a PostgreSQL!"))

    def clean_str(self, val, max_len=None):
        if val is None:
            return ""
        s = str(val).strip()
        if max_len and len(s) > max_len:
            return s[:max_len]
        return s

    def migrar_empresas(self, raw_empresas):
        creadas = 0
        actualizadas = 0

        for item in raw_empresas:
            nombre = self.clean_str(item.get('nome') or item.get('nombre') or item.get('name'), 255)
            if not nombre:
                continue

            sector = self.clean_str(item.get('sector'), 150) or "General / Comercial"
            nit = self.clean_str(item.get('nit'), 50)
            ciudad = self.clean_str(item.get('ciudad'), 100)
            sitio_web = self.clean_str(item.get('web') or item.get('sitio_web'), 255)
            notas = self.clean_str(item.get('notes') or item.get('notas'))

            empresa, created = Empresa.objects.update_or_create(
                nombre=nombre,
                defaults={
                    'sector': sector,
                    'nit': nit,
                    'ciudad': ciudad,
                    'sitio_web': sitio_web,
                    'notas': notas,
                }
            )
            if created:
                creadas += 1
            else:
                actualizadas += 1

        return creadas, actualizadas

    def normalizar_pulso(self, raw_val):
        try:
            val = int(raw_val)
            if 1 <= val <= 4:
                return val
        except (ValueError, TypeError):
            pass
        return 1

    def normalizar_fase(self, raw_val):
        val = str(raw_val or '').strip().upper()
        if val in ('R', 'D', 'E'):
            return val
        if 'RELACION' in val or 'RECONOCIMIENTO' in val:
            return 'R'
        if 'DESARROLLO' in val or 'DECISION' in val:
            return 'D'
        if 'ESTRUCTURACION' in val or 'EJECUCION' in val:
            return 'E'
        return 'R'

    def normalizar_tipo_persona(self, raw_val):
        val = str(raw_val or '').strip().lower()
        if 'juri' in val or 'empresa' in val:
            return Contacto.TipoPersona.JURIDICA
        return Contacto.TipoPersona.NATURAL

    def normalizar_tipo_relacion(self, raw_val):
        val = str(raw_val or '').strip().lower()
        mapping = {
            'prospecto': Contacto.TipoRelacion.PROSPECTO,
            'lead': Contacto.TipoRelacion.PROSPECTO,
            'cliente_bronze': Contacto.TipoRelacion.CLIENTE_BRONZE,
            'cliente_silver': Contacto.TipoRelacion.CLIENTE_SILVER,
            'cliente_gold': Contacto.TipoRelacion.CLIENTE_GOLD,
            'cliente_platinum': Contacto.TipoRelacion.CLIENTE_PLATINUM,
            'aliado': Contacto.TipoRelacion.ALIADO,
            'proveedor': Contacto.TipoRelacion.PROVEEDOR,
            'interno': Contacto.TipoRelacion.INTERNO,
        }
        for k, v in mapping.items():
            if k in val:
                return v
        return Contacto.TipoRelacion.PROSPECTO

    def normalizar_canal_entrada(self, raw_val):
        val = str(raw_val or '').strip().lower()
        mapping = {
            'whatsapp': Contacto.CanalEntrada.WHATSAPP,
            'referido': Contacto.CanalEntrada.REFERIDO,
            'recomendado': Contacto.CanalEntrada.REFERIDO,
            'instagram': Contacto.CanalEntrada.INSTAGRAM,
            'linkedin': Contacto.CanalEntrada.LINKEDIN,
            'feria': Contacto.CanalEntrada.FERIA_EVENTO,
            'evento': Contacto.CanalEntrada.FERIA_EVENTO,
            'web': Contacto.CanalEntrada.WEB,
            'directo': Contacto.CanalEntrada.DIRECTO,
        }
        for k, v in mapping.items():
            if k in val:
                return v
        return Contacto.CanalEntrada.DIRECTO

    def migrar_contactos(self, csv_path, custom_contacts, meta_overrides):
        creados = 0
        actualizados = 0

        # Caché de empresas en memoria
        empresas_cache = {e.nombre.lower().strip(): e for e in Empresa.objects.all()}

        def vincular_empresa(nombre_empresa):
            nombre_empresa = self.clean_str(nombre_empresa, 255)
            if not nombre_empresa:
                return None
            key = nombre_empresa.lower()
            if key in empresas_cache:
                return empresas_cache[key]
            empresa, _ = Empresa.objects.get_or_create(
                nombre=nombre_empresa,
                defaults={'sector': 'General / Comercial'}
            )
            empresas_cache[key] = empresa
            return empresa

        # 2.A Procesar CSV de Contactos si existe
        if csv_path and os.path.exists(csv_path):
            with open(csv_path, 'r', encoding='utf-8-sig', errors='replace') as f:
                # Detectar delimitador (; o ,)
                sample = f.read(2048)
                f.seek(0)
                delimiter = ';' if ';' in sample else ','
                reader = csv.DictReader(f, delimiter=delimiter)

                for row in reader:
                    nombre = self.clean_str(row.get('nome') or row.get('nombre') or row.get('Nombre'), 255)
                    if not nombre:
                        continue

                    telefono = self.clean_str(row.get('numero') or row.get('telefono') or row.get('Telefono'), 50)
                    email = self.clean_str(row.get('email') or row.get('correo'), 254)
                    empresa_raw = row.get('Empresa') or row.get('empresa') or ''
                    empresa_obj = vincular_empresa(empresa_raw)

                    # Obtener posibles overrides de R.E.D. en JSON
                    cid = row.get('id') or nombre
                    pulso = self.normalizar_pulso(meta_overrides['pulses'].get(cid))
                    fase = self.normalizar_fase(meta_overrides['phases'].get(cid))
                    canal = self.normalizar_canal_entrada(meta_overrides['channels'].get(cid))
                    persona = self.normalizar_tipo_persona(meta_overrides['personas'].get(cid))
                    notas = self.clean_str(meta_overrides['notes'].get(cid))

                    contacto, created = Contacto.objects.update_or_create(
                        nombre_completo=nombre,
                        defaults={
                            'empresa': empresa_obj,
                            'telefono': telefono,
                            'email': email,
                            'pulso_vital': pulso,
                            'fase_red': fase,
                            'canal_entrada': canal,
                            'tipo_persona': persona,
                            'notas': notas,
                        }
                    )
                    if created:
                        creados += 1
                    else:
                        actualizados += 1

        # 2.B Procesar custom_contacts de data_storage.json
        for item in custom_contacts:
            nombre = self.clean_str(item.get('nome') or item.get('nombre_completo') or item.get('name'), 255)
            if not nombre:
                continue

            telefono = self.clean_str(item.get('numero') or item.get('telefono'), 50)
            email = self.clean_str(item.get('email'), 254)
            rol = self.clean_str(item.get('rol') or item.get('contactRole') or item.get('cargo'), 150)
            empresa_raw = item.get('empresa') or item.get('Empresa')
            empresa_obj = vincular_empresa(empresa_raw)

            cid = item.get('id') or nombre
            pulso = self.normalizar_pulso(item.get('pulso_vital') or meta_overrides['pulses'].get(cid))
            fase = self.normalizar_fase(item.get('fase_red') or meta_overrides['phases'].get(cid))
            canal = self.normalizar_canal_entrada(item.get('canal_entrada') or meta_overrides['channels'].get(cid))
            relacion = self.normalizar_tipo_relacion(item.get('tipo_relacion') or item.get('relationshipType'))
            persona = self.normalizar_tipo_persona(item.get('tipo_persona') or meta_overrides['personas'].get(cid))
            notas = self.clean_str(item.get('notas') or item.get('notes') or meta_overrides['notes'].get(cid))

            contacto, created = Contacto.objects.update_or_create(
                nombre_completo=nombre,
                defaults={
                    'empresa': empresa_obj,
                    'telefono': telefono,
                    'email': email,
                    'rol': rol,
                    'tipo_relacion': relacion,
                    'tipo_persona': persona,
                    'canal_entrada': canal,
                    'pulso_vital': pulso,
                    'fase_red': fase,
                    'notas': notas,
                }
            )
            if created:
                creados += 1
            else:
                actualizados += 1

        return creados, actualizados

    def normalizar_estado_proyecto(self, raw_status):
        val = str(raw_status or '').strip().lower()
        mapping = {
            'mql': Proyecto.Estado.MQL,
            'conversacion': Proyecto.Estado.CONVERSACION,
            'sql': Proyecto.Estado.SQL,
            'propuesta': Proyecto.Estado.PROPUESTA,
            'negociacion': Proyecto.Estado.NEGOCIACION,
            'ejecucion': Proyecto.Estado.EJECUCION,
            'pausa': Proyecto.Estado.PAUSA,
            'finalizado': Proyecto.Estado.EJECUCION,
        }
        return mapping.get(val, Proyecto.Estado.MQL)

    def normalizar_linea_operativa(self, raw_val):
        val = str(raw_val or '').strip().lower()
        if not val:
            return ""
        for choice, _ in Proyecto.LineaOperativa.choices:
            if choice == val or choice in val:
                return choice
        return ""

    def normalizar_categoria_proyecto(self, raw_val):
        val = str(raw_val or '').strip().lower()
        if not val:
            return ""
        for choice, _ in Proyecto.Categoria.choices:
            if choice == val or choice in val:
                return choice
        return ""

    def normalizar_monto(self, raw_val):
        if raw_val is None:
            return Decimal('0.00')
        try:
            return Decimal(str(raw_val).replace('$', '').replace(',', '').strip() or '0.00')
        except (InvalidOperation, TypeError, ValueError):
            return Decimal('0.00')

    def migrar_proyectos(self, raw_projects):
        creados = 0
        actualizados = 0

        # Caché de contactos y empresas
        contactos_cache = {c.nombre_completo.lower().strip(): c for c in Contacto.objects.all()}
        empresas_cache = {e.nombre.lower().strip(): e for e in Empresa.objects.all()}

        for p in raw_projects:
            titulo = self.clean_str(p.get('title') or p.get('titulo') or p.get('name'), 255)
            if not titulo:
                continue

            # Buscar contacto o empresa
            client_name = self.clean_str(p.get('client') or p.get('cliente'))
            contacto_obj = None
            empresa_obj = None

            if client_name:
                ckey = client_name.lower()
                if ckey in contactos_cache:
                    contacto_obj = contactos_cache[ckey]
                    empresa_obj = contacto_obj.empresa
                elif ckey in empresas_cache:
                    empresa_obj = empresas_cache[ckey]

            estado = self.normalizar_estado_proyecto(p.get('status'))
            monto = self.normalizar_monto(p.get('amount') or p.get('monto'))
            linea_op = self.normalizar_linea_operativa(p.get('lineaOperativa'))
            categoria = self.normalizar_categoria_proyecto(p.get('categoria'))
            brief_url = self.clean_str(p.get('briefUrl'), 500)
            proposal_url = self.clean_str(p.get('proposalUrl'), 500)
            proximo_paso = self.clean_str(p.get('nextStep') or p.get('proximoPaso'), 255)
            notas = self.clean_str(p.get('notes') or p.get('notas'))

            # Parsear fecha límite si existe
            due_date_raw = p.get('dueDate')
            fecha_limite = parse_date(str(due_date_raw)) if due_date_raw else None

            proyecto, created = Proyecto.objects.update_or_create(
                titulo=titulo,
                defaults={
                    'empresa': empresa_obj,
                    'contacto': contacto_obj,
                    'monto_proyectado': monto,
                    'estado': estado,
                    'linea_operativa': linea_op,
                    'categoria': categoria,
                    'brief_url': brief_url,
                    'proposal_url': proposal_url,
                    'proximo_paso': proximo_paso,
                    'fecha_limite': fecha_limite,
                    'notas': notas,
                }
            )
            if created:
                creados += 1
            else:
                actualizados += 1

        return creados, actualizados
